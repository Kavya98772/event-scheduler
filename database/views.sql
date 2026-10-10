-- views.sql | Dashboard / calendar / analytics views
CREATE OR REPLACE VIEW venue_schedule AS
SELECT s.schedule_id, s.event_id, e.event_name, s.venue_id, v.venue_name, v.building, s.start_time, s.end_time,
       s.status, e.status AS event_status, o.name AS organizer_name,
       (SELECT COALESCE(json_agg(ju.name ORDER BY ju.name), '[]'::json) FROM judge_assignment ja
          JOIN judge j ON j.judge_id = ja.judge_id JOIN users ju ON ju.user_id = j.user_id
         WHERE ja.schedule_id = s.schedule_id) AS judges
FROM event_schedule s JOIN event e ON e.event_id = s.event_id JOIN venue v ON v.venue_id = s.venue_id
JOIN users o ON o.user_id = e.organizer_id;

CREATE OR REPLACE VIEW upcoming_events AS
SELECT vs.schedule_id, vs.event_id, vs.event_name, et.type_name, vs.organizer_name, vs.venue_name, vs.start_time, vs.end_time,
       vs.status AS schedule_status, vs.event_status,
       (SELECT count(*)::int FROM registration r WHERE r.event_id = vs.event_id AND r.status = 'REGISTERED') AS registered
FROM venue_schedule vs JOIN event e ON e.event_id = vs.event_id JOIN event_type et ON et.event_type_id = e.event_type_id
WHERE vs.status IN ('SCHEDULED','ONGOING') AND vs.end_time > now();

CREATE OR REPLACE VIEW participant_schedule AS
SELECT p.participant_id, u.name AS participant_name, p.registration_number, s.schedule_id, e.event_id, e.event_name,
       v.venue_name, s.start_time, s.end_time, s.status
FROM registration r JOIN participant p ON p.participant_id = r.participant_id JOIN users u ON u.user_id = p.user_id
JOIN event e ON e.event_id = r.event_id JOIN event_schedule s ON s.event_id = e.event_id AND s.status <> 'CANCELLED'
JOIN venue v ON v.venue_id = s.venue_id WHERE r.status = 'REGISTERED';

CREATE OR REPLACE VIEW judge_schedule AS
SELECT j.judge_id, u.name AS judge_name, j.specialization, s.schedule_id, e.event_name, v.venue_name, s.start_time, s.end_time, s.status
FROM judge_assignment ja JOIN judge j ON j.judge_id = ja.judge_id JOIN users u ON u.user_id = j.user_id
JOIN event_schedule s ON s.schedule_id = ja.schedule_id JOIN event e ON e.event_id = s.event_id JOIN venue v ON v.venue_id = s.venue_id;

CREATE OR REPLACE VIEW volunteer_schedule AS
SELECT vo.volunteer_id, u.name AS volunteer_name, va.responsibility, s.schedule_id, e.event_name, v.venue_name, s.start_time, s.end_time, s.status
FROM volunteer_assignment va JOIN volunteer vo ON vo.volunteer_id = va.volunteer_id JOIN users u ON u.user_id = vo.user_id
JOIN event_schedule s ON s.schedule_id = va.schedule_id JOIN event e ON e.event_id = s.event_id JOIN venue v ON v.venue_id = s.venue_id;

CREATE OR REPLACE VIEW event_statistics AS
SELECT e.event_id, e.event_name, et.type_name, e.status, e.max_participants,
  count(r.registration_id) FILTER (WHERE r.status = 'REGISTERED')::int AS registered,
  count(a.attendance_id) FILTER (WHERE a.attendance_status IN ('PRESENT','LATE'))::int AS attended,
  CASE WHEN count(a.attendance_id) = 0 THEN NULL
       ELSE ROUND(100.0 * count(a.attendance_id) FILTER (WHERE a.attendance_status IN ('PRESENT','LATE'))
            / NULLIF(count(r.registration_id) FILTER (WHERE r.status = 'REGISTERED'), 0), 1) END AS attendance_pct,
  ROUND(AVG(er.score), 1) AS avg_score,
  RANK() OVER (ORDER BY count(r.registration_id) FILTER (WHERE r.status = 'REGISTERED') DESC) AS popularity_rank
FROM event e JOIN event_type et ON et.event_type_id = e.event_type_id
LEFT JOIN registration r ON r.event_id = e.event_id
LEFT JOIN attendance a ON a.event_id = r.event_id AND a.participant_id = r.participant_id
LEFT JOIN event_result er ON er.event_id = r.event_id AND er.participant_id = r.participant_id
GROUP BY e.event_id, et.type_name;

CREATE OR REPLACE VIEW resource_utilization AS
SELECT r.resource_id, r.resource_name, r.resource_type, r.total_quantity, r.available_quantity, r.status,
  count(ra.allocation_id) FILTER (WHERE s.status <> 'CANCELLED')::int AS allocations,
  ROUND(COALESCE(SUM(ra.quantity * EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0) FILTER (WHERE s.status <> 'CANCELLED'), 0)::numeric, 1) AS unit_hours,
  COALESCE(SUM(ra.quantity) FILTER (WHERE s.status IN ('SCHEDULED','ONGOING') AND s.end_time > now()), 0)::int AS upcoming_units
FROM resource r LEFT JOIN resource_allocation ra ON ra.resource_id = r.resource_id
LEFT JOIN event_schedule s ON s.schedule_id = ra.schedule_id GROUP BY r.resource_id;

CREATE OR REPLACE VIEW venue_utilization AS
SELECT x.*, RANK() OVER (ORDER BY x.booked_hours DESC) AS usage_rank FROM (
  SELECT v.venue_id, v.venue_name, v.building, v.capacity, v.status,
    count(s.schedule_id) FILTER (WHERE s.status <> 'CANCELLED')::int AS sessions,
    ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0) FILTER (WHERE s.status <> 'CANCELLED'), 0)::numeric, 1) AS booked_hours,
    ROUND(AVG(100.0 * reg.cnt / v.capacity) FILTER (WHERE s.status <> 'CANCELLED'), 1) AS avg_fill_pct
  FROM venue v LEFT JOIN event_schedule s ON s.venue_id = v.venue_id
  LEFT JOIN LATERAL (SELECT count(*) AS cnt FROM registration r WHERE r.event_id = s.event_id AND r.status = 'REGISTERED') reg ON TRUE
  GROUP BY v.venue_id) x;

-- Participants registered for two events whose schedules overlap (should always be empty).
CREATE OR REPLACE VIEW participant_conflicts AS
SELECT r1.participant_id, u.name AS participant_name, e1.event_name AS event_a, e2.event_name AS event_b, s1.start_time, s1.end_time
FROM registration r1
JOIN registration r2 ON r2.participant_id = r1.participant_id AND r2.event_id > r1.event_id AND r2.status = 'REGISTERED'
JOIN event_schedule s1 ON s1.event_id = r1.event_id AND s1.status <> 'CANCELLED'
JOIN event_schedule s2 ON s2.event_id = r2.event_id AND s2.status <> 'CANCELLED'
JOIN event e1 ON e1.event_id = r1.event_id JOIN event e2 ON e2.event_id = r2.event_id
JOIN participant p ON p.participant_id = r1.participant_id JOIN users u ON u.user_id = p.user_id
WHERE r1.status = 'REGISTERED' AND tstzrange(s1.start_time, s1.end_time, '[)') && tstzrange(s2.start_time, s2.end_time, '[)');

CREATE OR REPLACE VIEW unscheduled_events AS
SELECT e.* FROM event e WHERE e.status IN ('DRAFT','OPEN')
AND NOT EXISTS (SELECT 1 FROM event_schedule s WHERE s.event_id = e.event_id AND s.status <> 'CANCELLED');
