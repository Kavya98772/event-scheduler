-- =====================================================================
-- triggers.sql  |  Each trigger closes a real integrity gap that CHECK/FK/UNIQUE cannot.
-- =====================================================================

-- T1: validates a schedule on INSERT or when venue/time change (status, deadline, venue,
-- capacity, participant clashes, dependencies, and re-validation of existing assignments).
CREATE OR REPLACE FUNCTION trg_validate_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ev event%ROWTYPE; dep TEXT; reg INT; cap INT;
BEGIN
  IF NEW.status = 'CANCELLED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'CANCELLED' AND NEW.venue_id = OLD.venue_id
     AND NEW.start_time = OLD.start_time AND NEW.end_time = OLD.end_time THEN RETURN NEW; END IF;
  SELECT * INTO ev FROM event WHERE event_id = NEW.event_id;
  IF ev.status NOT IN ('DRAFT','OPEN','SCHEDULED') THEN
    RAISE EXCEPTION 'Event "%" is % and cannot be scheduled', ev.event_name, ev.status USING ERRCODE = 'SC008'; END IF;
  IF NEW.start_time < ev.registration_deadline THEN
    RAISE EXCEPTION 'Event would start before its registration deadline' USING ERRCODE = 'SC008'; END IF;
  IF NOT check_venue_availability(NEW.venue_id, NEW.start_time, NEW.end_time, NEW.schedule_id) THEN
    RAISE EXCEPTION 'Venue is unavailable or already booked for that time' USING ERRCODE = 'SC001'; END IF;
  SELECT count(*) INTO reg FROM registration WHERE event_id = NEW.event_id AND status = 'REGISTERED';
  SELECT capacity INTO cap FROM venue WHERE venue_id = NEW.venue_id;
  IF reg > cap THEN RAISE EXCEPTION '% registered participants exceed venue capacity %', reg, cap USING ERRCODE = 'SC002'; END IF;
  IF EXISTS (SELECT 1 FROM check_participant_conflict(NEW.event_id, NEW.start_time, NEW.end_time, NEW.schedule_id)) THEN
    RAISE EXCEPTION 'Registered participants have a clashing event at that time' USING ERRCODE = 'SC003'; END IF;
  dep := check_dependencies(NEW.event_id, NEW.start_time);
  IF dep IS NOT NULL THEN RAISE EXCEPTION 'Prerequisite not satisfied: %', dep USING ERRCODE = 'SC007'; END IF;
  IF TG_OP = 'UPDATE' THEN  -- rescheduling must not break existing assignments
    IF EXISTS (SELECT 1 FROM judge_assignment ja WHERE ja.schedule_id = NEW.schedule_id
               AND check_judge_conflict(ja.judge_id, NEW.start_time, NEW.end_time, NEW.schedule_id)) THEN
      RAISE EXCEPTION 'An assigned judge is busy at the new time' USING ERRCODE = 'SC004'; END IF;
    IF EXISTS (SELECT 1 FROM volunteer_assignment va WHERE va.schedule_id = NEW.schedule_id
               AND check_volunteer_conflict(va.volunteer_id, NEW.start_time, NEW.end_time, NEW.schedule_id)) THEN
      RAISE EXCEPTION 'An assigned volunteer is busy at the new time' USING ERRCODE = 'SC005'; END IF;
    IF EXISTS (SELECT 1 FROM resource_allocation ra WHERE ra.schedule_id = NEW.schedule_id
               AND NOT check_resource_availability(ra.resource_id, ra.quantity, NEW.start_time, NEW.end_time, NEW.schedule_id)) THEN
      RAISE EXCEPTION 'Allocated resources are not available at the new time' USING ERRCODE = 'SC006'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_schedule BEFORE INSERT OR UPDATE ON event_schedule
  FOR EACH ROW EXECUTE FUNCTION trg_validate_schedule();

-- T2: registrations must respect status, deadline, max_participants, venue capacity of any
-- active schedule, and participant clashes. Locks event row then participant (same order as schedule_event).
CREATE OR REPLACE FUNCTION trg_validate_registration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ev event%ROWTYPE; n INT; cap INT;
BEGIN
  IF NEW.status <> 'REGISTERED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'REGISTERED' THEN RETURN NEW; END IF;
  SELECT * INTO ev FROM event WHERE event_id = NEW.event_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('participant:' || NEW.participant_id, 0));
  IF ev.status NOT IN ('OPEN','SCHEDULED') THEN
    RAISE EXCEPTION 'Registration is closed: event is %', ev.status USING ERRCODE = 'SC008'; END IF;
  IF NEW.registration_date > ev.registration_deadline THEN
    RAISE EXCEPTION 'Registration deadline has passed' USING ERRCODE = 'SC008'; END IF;
  SELECT count(*) INTO n FROM registration WHERE event_id = NEW.event_id AND status = 'REGISTERED' AND registration_id <> NEW.registration_id;
  IF n >= ev.max_participants THEN RAISE EXCEPTION 'Event is full (% participants)', ev.max_participants USING ERRCODE = 'SC002'; END IF;
  SELECT min(v.capacity) INTO cap FROM event_schedule s JOIN venue v ON v.venue_id = s.venue_id
   WHERE s.event_id = NEW.event_id AND s.status <> 'CANCELLED';
  IF cap IS NOT NULL AND n >= cap THEN RAISE EXCEPTION 'Venue capacity (%) reached', cap USING ERRCODE = 'SC002'; END IF;
  IF EXISTS (SELECT 1 FROM event_schedule s1
             JOIN registration r2 ON r2.participant_id = NEW.participant_id AND r2.status = 'REGISTERED' AND r2.event_id <> NEW.event_id
             JOIN event_schedule s2 ON s2.event_id = r2.event_id AND s2.status <> 'CANCELLED'
             WHERE s1.event_id = NEW.event_id AND s1.status <> 'CANCELLED'
               AND tstzrange(s1.start_time, s1.end_time, '[)') && tstzrange(s2.start_time, s2.end_time, '[)')) THEN
    RAISE EXCEPTION 'You are already registered for an event that overlaps this one' USING ERRCODE = 'SC003'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_registration BEFORE INSERT OR UPDATE ON registration
  FOR EACH ROW EXECUTE FUNCTION trg_validate_registration();

-- T3/T4: judge and volunteer assignments (direct inserts bypass schedule_event, so re-check here).
CREATE OR REPLACE FUNCTION trg_validate_judge_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s event_schedule%ROWTYPE; j judge%ROWTYPE;
BEGIN
  SELECT * INTO j FROM judge WHERE judge_id = NEW.judge_id FOR UPDATE;
  SELECT * INTO s FROM event_schedule WHERE schedule_id = NEW.schedule_id;
  IF s.status = 'CANCELLED' THEN RAISE EXCEPTION 'Schedule is cancelled' USING ERRCODE = 'SC008'; END IF;
  IF j.availability_status <> 'AVAILABLE' THEN RAISE EXCEPTION 'Judge is not available' USING ERRCODE = 'SC004'; END IF;
  IF check_judge_conflict(NEW.judge_id, s.start_time, s.end_time, NEW.schedule_id) THEN
    RAISE EXCEPTION 'Judge is already assigned to an overlapping event' USING ERRCODE = 'SC004'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_judge_assignment BEFORE INSERT OR UPDATE ON judge_assignment
  FOR EACH ROW EXECUTE FUNCTION trg_validate_judge_assignment();

CREATE OR REPLACE FUNCTION trg_validate_volunteer_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s event_schedule%ROWTYPE; v volunteer%ROWTYPE;
BEGIN
  SELECT * INTO v FROM volunteer WHERE volunteer_id = NEW.volunteer_id FOR UPDATE;
  SELECT * INTO s FROM event_schedule WHERE schedule_id = NEW.schedule_id;
  IF s.status = 'CANCELLED' THEN RAISE EXCEPTION 'Schedule is cancelled' USING ERRCODE = 'SC008'; END IF;
  IF v.availability_status <> 'AVAILABLE' THEN RAISE EXCEPTION 'Volunteer is not available' USING ERRCODE = 'SC005'; END IF;
  IF check_volunteer_conflict(NEW.volunteer_id, s.start_time, s.end_time, NEW.schedule_id) THEN
    RAISE EXCEPTION 'Volunteer is already assigned to an overlapping event' USING ERRCODE = 'SC005'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_volunteer_assignment BEFORE INSERT OR UPDATE ON volunteer_assignment
  FOR EACH ROW EXECUTE FUNCTION trg_validate_volunteer_assignment();

-- T5: resource allocations may never exceed total quantity at any instant.
CREATE OR REPLACE FUNCTION trg_validate_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s event_schedule%ROWTYPE;
BEGIN
  PERFORM 1 FROM resource WHERE resource_id = NEW.resource_id FOR UPDATE;
  SELECT * INTO s FROM event_schedule WHERE schedule_id = NEW.schedule_id;
  IF s.status = 'CANCELLED' THEN RAISE EXCEPTION 'Schedule is cancelled' USING ERRCODE = 'SC008'; END IF;
  IF NOT check_resource_availability(NEW.resource_id, NEW.quantity, s.start_time, s.end_time, NEW.schedule_id) THEN
    RAISE EXCEPTION 'Resource shortage: not enough units available in that time window' USING ERRCODE = 'SC006'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_allocation BEFORE INSERT OR UPDATE ON resource_allocation
  FOR EACH ROW EXECUTE FUNCTION trg_validate_allocation();

-- T6: keep resource.available_quantity in sync when allocations change.
CREATE OR REPLACE FUNCTION trg_sync_resource() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM recalc_resource(NEW.resource_id); END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN PERFORM recalc_resource(OLD.resource_id); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_sync_resource AFTER INSERT OR UPDATE OR DELETE ON resource_allocation
  FOR EACH ROW EXECUTE FUNCTION trg_sync_resource();

-- T7: schedule status changes. Cancelling releases resources/judges/volunteers;
-- ONGOING/COMPLETED transitions refresh resource availability.
CREATE OR REPLACE FUNCTION trg_schedule_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'CANCELLED' THEN
    DELETE FROM resource_allocation WHERE schedule_id = NEW.schedule_id;
    DELETE FROM judge_assignment WHERE schedule_id = NEW.schedule_id;
    DELETE FROM volunteer_assignment WHERE schedule_id = NEW.schedule_id;
  ELSE
    PERFORM recalc_resource(resource_id) FROM resource_allocation WHERE schedule_id = NEW.schedule_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_schedule_status AFTER UPDATE OF status ON event_schedule
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION trg_schedule_status();

-- T8: dependency cycles (A->B->C->A) cannot be expressed as a CHECK.
CREATE OR REPLACE FUNCTION trg_dependency_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (WITH RECURSIVE chain(id) AS (
               SELECT NEW.prerequisite_event_id
               UNION
               SELECT d.prerequisite_event_id FROM event_dependency d JOIN chain c ON d.event_id = c.id)
             SELECT 1 FROM chain WHERE id = NEW.event_id) THEN
    RAISE EXCEPTION 'Circular event dependency detected' USING ERRCODE = 'SC007'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_dependency_cycle BEFORE INSERT OR UPDATE ON event_dependency
  FOR EACH ROW EXECUTE FUNCTION trg_dependency_cycle();

-- T9: a participant/judge/volunteer profile must belong to a user with the matching role.
CREATE OR REPLACE FUNCTION trg_role_profile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r TEXT;
BEGIN
  SELECT role INTO r FROM users WHERE user_id = NEW.user_id;
  IF r IS DISTINCT FROM TG_ARGV[0] THEN
    RAISE EXCEPTION 'User % has role %, expected %', NEW.user_id, r, TG_ARGV[0] USING ERRCODE = 'SC011'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_role_participant BEFORE INSERT OR UPDATE OF user_id ON participant FOR EACH ROW EXECUTE FUNCTION trg_role_profile('PARTICIPANT');
CREATE TRIGGER trg_role_judge BEFORE INSERT OR UPDATE OF user_id ON judge FOR EACH ROW EXECUTE FUNCTION trg_role_profile('JUDGE');
CREATE TRIGGER trg_role_volunteer BEFORE INSERT OR UPDATE OF user_id ON volunteer FOR EACH ROW EXECUTE FUNCTION trg_role_profile('VOLUNTEER');
