-- =====================================================================
-- functions.sql  |  Conflict-detection logic lives in the database.
-- check_*_conflict -> TRUE when a conflict EXISTS; check_*_availability -> TRUE when OK.
-- Custom SQLSTATEs: SC001 venue, SC002 capacity, SC003 participant, SC004 judge,
-- SC005 volunteer, SC006 resource, SC007 dependency, SC008 deadline/status,
-- SC010 not found, SC011 role mismatch.
-- All overlap tests use half-open ranges tstzrange(start,end,'[)').
-- =====================================================================

CREATE OR REPLACE FUNCTION check_venue_availability(p_venue INT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_exclude INT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM venue WHERE venue_id = p_venue AND status = 'AVAILABLE')
     AND NOT EXISTS (SELECT 1 FROM event_schedule s
                     WHERE s.venue_id = p_venue AND s.status <> 'CANCELLED'
                       AND (p_exclude IS NULL OR s.schedule_id <> p_exclude)
                       AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange(p_start, p_end, '[)'));
$$;

CREATE OR REPLACE FUNCTION check_venue_capacity(p_event INT, p_venue INT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM registration WHERE event_id = p_event AND status = 'REGISTERED')
         <= (SELECT capacity FROM venue WHERE venue_id = p_venue);
$$;

-- Participants of p_event who are also registered for another event whose schedule overlaps the window.
CREATE OR REPLACE FUNCTION check_participant_conflict(p_event INT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_exclude INT DEFAULT NULL)
RETURNS TABLE (participant_id INT, conflicting_event TEXT) LANGUAGE sql STABLE AS $$
  SELECT DISTINCT r.participant_id, e2.event_name
  FROM registration r
  JOIN registration r2 ON r2.participant_id = r.participant_id AND r2.event_id <> r.event_id AND r2.status = 'REGISTERED'
  JOIN event_schedule s ON s.event_id = r2.event_id AND s.status <> 'CANCELLED'
  JOIN event e2 ON e2.event_id = r2.event_id
  WHERE r.event_id = p_event AND r.status = 'REGISTERED'
    AND (p_exclude IS NULL OR s.schedule_id <> p_exclude)
    AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange(p_start, p_end, '[)');
$$;

CREATE OR REPLACE FUNCTION check_judge_conflict(p_judge INT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_exclude INT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM judge_assignment ja JOIN event_schedule s ON s.schedule_id = ja.schedule_id
                 WHERE ja.judge_id = p_judge AND s.status <> 'CANCELLED'
                   AND (p_exclude IS NULL OR s.schedule_id <> p_exclude)
                   AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange(p_start, p_end, '[)'));
$$;

CREATE OR REPLACE FUNCTION check_volunteer_conflict(p_vol INT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_exclude INT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM volunteer_assignment va JOIN event_schedule s ON s.schedule_id = va.schedule_id
                 WHERE va.volunteer_id = p_vol AND s.status <> 'CANCELLED'
                   AND (p_exclude IS NULL OR s.schedule_id <> p_exclude)
                   AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange(p_start, p_end, '[)'));
$$;

-- Quantities are time-dependent: the check uses PEAK concurrent usage inside the window
-- (usage is evaluated at p_start and at every allocation start inside the window), so
-- sequential, non-overlapping uses of the same units never conflict.
CREATE OR REPLACE FUNCTION check_resource_availability(p_resource INT, p_qty INT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_exclude INT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT r.status = 'ACTIVE' AND p_qty > 0 AND p_qty + COALESCE((
    SELECT MAX(x.u) FROM (
      SELECT (SELECT COALESCE(SUM(ra.quantity), 0) FROM resource_allocation ra
              JOIN event_schedule s ON s.schedule_id = ra.schedule_id
              WHERE ra.resource_id = p_resource AND s.status <> 'CANCELLED'
                AND (p_exclude IS NULL OR s.schedule_id <> p_exclude)
                AND s.start_time <= pt.t AND s.end_time > pt.t) AS u
      FROM (SELECT p_start AS t
            UNION
            SELECT s.start_time FROM resource_allocation ra JOIN event_schedule s ON s.schedule_id = ra.schedule_id
            WHERE ra.resource_id = p_resource AND s.status <> 'CANCELLED'
              AND (p_exclude IS NULL OR s.schedule_id <> p_exclude)
              AND s.start_time > p_start AND s.start_time < p_end) pt
    ) x), 0) <= r.total_quantity
  FROM resource r WHERE r.resource_id = p_resource;
$$;

-- Returns the name of the first unmet prerequisite, or NULL when all are satisfied.
CREATE OR REPLACE FUNCTION check_dependencies(p_event INT, p_start TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT p.event_name
  FROM event_dependency d JOIN event p ON p.event_id = d.prerequisite_event_id
  WHERE d.event_id = p_event AND CASE d.dependency_type
    WHEN 'MUST_COMPLETE_BEFORE' THEN COALESCE((SELECT max(s.end_time) FROM event_schedule s
        WHERE s.event_id = d.prerequisite_event_id AND s.status <> 'CANCELLED') > p_start, TRUE)
    ELSE COALESCE((SELECT min(s.start_time) FROM event_schedule s
        WHERE s.event_id = d.prerequisite_event_id AND s.status <> 'CANCELLED') >= p_start, TRUE)
  END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_available_venues(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_min_capacity INT DEFAULT 0)
RETURNS SETOF venue LANGUAGE sql STABLE AS $$
  SELECT v.* FROM venue v
  WHERE v.capacity >= p_min_capacity AND check_venue_availability(v.venue_id, p_start, p_end) ORDER BY v.capacity;
$$;

-- Dry run: every check as a row. Powers the checklist in the Schedule UI. Changes nothing.
CREATE OR REPLACE FUNCTION preview_schedule(
  p_event INT, p_venue INT, p_start TIMESTAMPTZ,
  p_judges INT[] DEFAULT '{}', p_volunteers JSONB DEFAULT '[]', p_resources JSONB DEFAULT '[]',
  p_exclude INT DEFAULT NULL)
RETURNS TABLE (check_name TEXT, passed BOOLEAN, message TEXT, code TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE ev event%ROWTYPE; v venue%ROWTYPE; e_end TIMESTAMPTZ; n INT; names TEXT; reg INT; dep TEXT;
BEGIN
  SELECT * INTO ev FROM event WHERE event_id = p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event % not found', p_event USING ERRCODE = 'SC010'; END IF;
  SELECT * INTO v FROM venue WHERE venue_id = p_venue;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venue % not found', p_venue USING ERRCODE = 'SC010'; END IF;
  e_end := p_start + make_interval(mins => ev.duration_minutes);

  RETURN QUERY SELECT 'Event status'::text, ev.status IN ('DRAFT','OPEN','SCHEDULED'),
    CASE WHEN ev.status IN ('DRAFT','OPEN','SCHEDULED') THEN 'Event can be scheduled'
         ELSE 'Event is ' || ev.status || ' and cannot be scheduled' END, 'SC008'::text;

  RETURN QUERY SELECT 'Registration deadline'::text, p_start >= ev.registration_deadline,
    CASE WHEN p_start >= ev.registration_deadline THEN 'Event starts after registration closes'
         ELSE 'Event would start before the registration deadline (' || to_char(ev.registration_deadline, 'DD Mon HH24:MI') || ')' END, 'SC008'::text;

  SELECT string_agg(DISTINCT e.event_name, ', ') INTO names
  FROM event_schedule s JOIN event e ON e.event_id = s.event_id
  WHERE s.venue_id = p_venue AND s.status <> 'CANCELLED' AND (p_exclude IS NULL OR s.schedule_id <> p_exclude)
    AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange(p_start, e_end, '[)');
  RETURN QUERY SELECT 'Venue available'::text, check_venue_availability(p_venue, p_start, e_end, p_exclude),
    CASE WHEN v.status <> 'AVAILABLE' THEN v.venue_name || ' is ' || v.status
         WHEN names IS NOT NULL THEN v.venue_name || ' is already booked by: ' || names
         ELSE v.venue_name || ' is free' END, 'SC001'::text;

  SELECT count(*) INTO reg FROM registration WHERE event_id = p_event AND status = 'REGISTERED';
  RETURN QUERY SELECT 'Venue capacity'::text, reg <= v.capacity,
    reg || ' registered vs capacity ' || v.capacity, 'SC002'::text;

  SELECT count(DISTINCT c.participant_id), string_agg(DISTINCT c.conflicting_event, ', ') INTO n, names
  FROM check_participant_conflict(p_event, p_start, e_end, p_exclude) c;
  RETURN QUERY SELECT 'Participant conflicts'::text, n = 0,
    CASE WHEN n = 0 THEN 'No registered participant has a clashing event'
         ELSE n || ' participant(s) clash with: ' || names END, 'SC003'::text;

  dep := check_dependencies(p_event, p_start);
  RETURN QUERY SELECT 'Event dependencies'::text, dep IS NULL,
    CASE WHEN dep IS NULL THEN 'Prerequisites satisfied' ELSE 'Prerequisite not satisfied: ' || dep END, 'SC007'::text;

  SELECT string_agg(u.name, ', ') INTO names
  FROM judge j JOIN users u ON u.user_id = j.user_id
  WHERE j.judge_id = ANY(p_judges)
    AND (j.availability_status <> 'AVAILABLE' OR check_judge_conflict(j.judge_id, p_start, e_end, p_exclude));
  RETURN QUERY SELECT 'Judges available'::text, names IS NULL,
    COALESCE('Judge conflict/unavailable: ' || names, COALESCE(cardinality(p_judges), 0) || ' judge(s) available'), 'SC004'::text;

  SELECT string_agg(u.name, ', ') INTO names
  FROM jsonb_to_recordset(COALESCE(p_volunteers, '[]'::jsonb)) AS x(volunteer_id INT, responsibility TEXT)
  JOIN volunteer vo ON vo.volunteer_id = x.volunteer_id JOIN users u ON u.user_id = vo.user_id
  WHERE vo.availability_status <> 'AVAILABLE' OR check_volunteer_conflict(vo.volunteer_id, p_start, e_end, p_exclude);
  RETURN QUERY SELECT 'Volunteers available'::text, names IS NULL,
    COALESCE('Volunteer conflict/unavailable: ' || names,
             jsonb_array_length(COALESCE(p_volunteers, '[]'::jsonb)) || ' volunteer(s) available'), 'SC005'::text;

  SELECT string_agg(r.resource_name || ' (requested ' || x.quantity || ', total ' || r.total_quantity || ')', ', ') INTO names
  FROM jsonb_to_recordset(COALESCE(p_resources, '[]'::jsonb)) AS x(resource_id INT, quantity INT)
  JOIN resource r ON r.resource_id = x.resource_id
  WHERE NOT check_resource_availability(r.resource_id, x.quantity, p_start, e_end, p_exclude);
  RETURN QUERY SELECT 'Resources available'::text, names IS NULL,
    COALESCE('Resource shortage: ' || names, 'All requested resources available'), 'SC006'::text;
END $$;

-- Atomic scheduling. Locks the rows involved (always in sorted order -> no deadlocks),
-- validates everything via preview_schedule, then inserts schedule + assignments + allocations.
-- Any exception aborts the whole function: nothing is ever partially scheduled.
CREATE OR REPLACE FUNCTION schedule_event(
  p_event INT, p_venue INT, p_start TIMESTAMPTZ,
  p_judges INT[] DEFAULT '{}', p_volunteers JSONB DEFAULT '[]', p_resources JSONB DEFAULT '[]')
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE ev event%ROWTYPE; v_end TIMESTAMPTZ; v_fails TEXT; v_code TEXT; v_sid INT;
BEGIN
  SELECT * INTO ev FROM event WHERE event_id = p_event FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event % not found', p_event USING ERRCODE = 'SC010'; END IF;
  PERFORM 1 FROM venue WHERE venue_id = p_venue FOR UPDATE;
  PERFORM 1 FROM judge WHERE judge_id = ANY(p_judges) ORDER BY judge_id FOR UPDATE;
  PERFORM 1 FROM volunteer WHERE volunteer_id IN (SELECT (x ->> 'volunteer_id')::int FROM jsonb_array_elements(COALESCE(p_volunteers,'[]'::jsonb)) x) ORDER BY volunteer_id FOR UPDATE;
  PERFORM 1 FROM resource WHERE resource_id IN (SELECT (x ->> 'resource_id')::int FROM jsonb_array_elements(COALESCE(p_resources,'[]'::jsonb)) x) ORDER BY resource_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('participant:' || t.participant_id, 0))
    FROM (SELECT participant_id FROM registration WHERE event_id = p_event AND status = 'REGISTERED' ORDER BY participant_id) t;

  SELECT string_agg(p.message, '; ' ORDER BY p.ord), (array_agg(p.code ORDER BY p.ord))[1] INTO v_fails, v_code
  FROM preview_schedule(p_event, p_venue, p_start, p_judges, p_volunteers, p_resources) WITH ORDINALITY AS p(check_name, passed, message, code, ord)
  WHERE NOT p.passed;
  IF v_fails IS NOT NULL THEN RAISE EXCEPTION '%', v_fails USING ERRCODE = v_code; END IF;

  v_end := p_start + make_interval(mins => ev.duration_minutes);
  INSERT INTO event_schedule(event_id, venue_id, start_time, end_time) VALUES (p_event, p_venue, p_start, v_end) RETURNING schedule_id INTO v_sid;
  INSERT INTO judge_assignment(judge_id, event_id, schedule_id) SELECT j, p_event, v_sid FROM unnest(p_judges) j;
  INSERT INTO volunteer_assignment(volunteer_id, event_id, schedule_id, responsibility)
    SELECT x.volunteer_id, p_event, v_sid, COALESCE(x.responsibility, 'Support')
    FROM jsonb_to_recordset(COALESCE(p_volunteers,'[]'::jsonb)) AS x(volunteer_id INT, responsibility TEXT);
  INSERT INTO resource_allocation(resource_id, event_id, schedule_id, quantity)
    SELECT x.resource_id, p_event, v_sid, x.quantity
    FROM jsonb_to_recordset(COALESCE(p_resources,'[]'::jsonb)) AS x(resource_id INT, quantity INT);
  UPDATE event SET status = 'SCHEDULED' WHERE event_id = p_event AND status IN ('DRAFT','OPEN');
  RETURN v_sid;
END $$;

-- Soft-cancel: triggers release resources and assignments.
CREATE OR REPLACE FUNCTION cancel_schedule(p_schedule INT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_event INT;
BEGIN
  UPDATE event_schedule SET status = 'CANCELLED' WHERE schedule_id = p_schedule AND status <> 'CANCELLED' RETURNING event_id INTO v_event;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Schedule % not found or already cancelled', p_schedule USING ERRCODE = 'SC010'; END IF;
  UPDATE event SET status = 'OPEN' WHERE event_id = v_event AND status = 'SCHEDULED'
    AND NOT EXISTS (SELECT 1 FROM event_schedule WHERE event_id = v_event AND status <> 'CANCELLED');
END $$;

-- Moves schedules through SCHEDULED -> ONGOING -> COMPLETED by the clock (called by the API).
CREATE OR REPLACE FUNCTION refresh_schedule_statuses() RETURNS VOID LANGUAGE sql AS $$
  UPDATE event_schedule SET status = 'COMPLETED' WHERE status IN ('SCHEDULED','ONGOING') AND end_time <= now();
  UPDATE event_schedule SET status = 'ONGOING' WHERE status = 'SCHEDULED' AND start_time <= now() AND end_time > now();
$$;

-- available_quantity = total minus units held by schedules that are ONGOING right now.
CREATE OR REPLACE FUNCTION recalc_resource(p_resource INT) RETURNS VOID LANGUAGE sql AS $$
  UPDATE resource r SET available_quantity = r.total_quantity - COALESCE((
      SELECT SUM(ra.quantity) FROM resource_allocation ra JOIN event_schedule s ON s.schedule_id = ra.schedule_id
      WHERE ra.resource_id = r.resource_id AND s.status = 'ONGOING'), 0)
  WHERE r.resource_id = p_resource;
$$;
