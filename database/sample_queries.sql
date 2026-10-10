-- sample_queries.sql | 16 queries demonstrating JOINs, GROUP BY/HAVING, subqueries, CTEs and window functions.
-- Run with: psql "$DATABASE_URL" -f database/sample_queries.sql

-- 1. Upcoming events (view over JOINs)
SELECT event_name, venue_name, start_time, registered FROM upcoming_events ORDER BY start_time;

-- 2. Venues free for a time range with at least 50 seats (function using range overlap)
SELECT venue_name, capacity FROM get_available_venues(current_date + 4 + time '11:00', current_date + 4 + time '12:30', 50);

-- 3. Events with more than 20 registered participants (GROUP BY + HAVING)
SELECT e.event_name, count(*) AS registered FROM event e JOIN registration r ON r.event_id = e.event_id
WHERE r.status = 'REGISTERED' GROUP BY e.event_id HAVING count(*) > 20 ORDER BY registered DESC;

-- 4. Participants registered for 5 or more events
SELECT u.name, count(*) AS events FROM registration r JOIN participant p ON p.participant_id = r.participant_id
JOIN users u ON u.user_id = p.user_id WHERE r.status = 'REGISTERED' GROUP BY u.user_id, u.name HAVING count(*) >= 5 ORDER BY events DESC, u.name LIMIT 10;

-- 5. Venue utilization (view with LATERAL join, aggregates and RANK)
SELECT venue_name, sessions, booked_hours, avg_fill_pct FROM venue_utilization ORDER BY booked_hours DESC;

-- 6. Busiest judges (window function)
SELECT u.name, count(ja.assignment_id) AS sessions, RANK() OVER (ORDER BY count(ja.assignment_id) DESC) AS busiest_rank
FROM judge j JOIN users u ON u.user_id = j.user_id LEFT JOIN judge_assignment ja ON ja.judge_id = j.judge_id GROUP BY j.judge_id, u.name;

-- 7. Resource utilization
SELECT resource_name, total_quantity, allocations, unit_hours FROM resource_utilization ORDER BY unit_hours DESC;

-- 8. Participants with schedule conflicts (should return 0 rows: the database prevents them)
SELECT * FROM participant_conflicts;

-- 9. Events with highest attendance (subquery on a view)
SELECT event_name, attended, attendance_pct FROM event_statistics WHERE attended = (SELECT max(attended) FROM event_statistics);

-- 10. Average attendance by event type
SELECT type_name, ROUND(AVG(attendance_pct), 1) AS avg_attendance_pct FROM event_statistics WHERE attendance_pct IS NOT NULL GROUP BY type_name;

-- 11. Rank events by registration count (RANK vs DENSE_RANK)
SELECT event_name, registered, RANK() OVER w AS rnk, DENSE_RANK() OVER w AS dense_rnk
FROM event_statistics WINDOW w AS (ORDER BY registered DESC);

-- 12. Venues with highest usage
SELECT venue_name, booked_hours, usage_rank FROM venue_utilization WHERE usage_rank <= 3 ORDER BY usage_rank;

-- 13. Events that have not been scheduled (correlated NOT EXISTS)
SELECT e.event_name, e.status FROM event e
WHERE NOT EXISTS (SELECT 1 FROM event_schedule s WHERE s.event_id = e.event_id AND s.status <> 'CANCELLED') ORDER BY e.event_id;

-- 14. Which resources still have 2 free units in a time window (CTE + conflict function)
WITH w AS (SELECT (current_date + 6 + time '10:00')::timestamptz AS s, (current_date + 6 + time '12:00')::timestamptz AS e)
SELECT r.resource_name, r.total_quantity, check_resource_availability(r.resource_id, 2, w.s, w.e) AS two_units_free
FROM resource r CROSS JOIN w ORDER BY r.resource_name;

-- 15. A participant's complete schedule
SELECT event_name, venue_name, start_time, end_time FROM participant_schedule WHERE participant_id = 1 ORDER BY start_time;

-- 16. Recursive CTE: full prerequisite chain of an event
WITH RECURSIVE chain AS (
  SELECT d.event_id, d.prerequisite_event_id, 1 AS depth FROM event_dependency d WHERE d.event_id = 5
  UNION ALL
  SELECT d.event_id, d.prerequisite_event_id, c.depth + 1 FROM event_dependency d JOIN chain c ON d.event_id = c.prerequisite_event_id)
SELECT c.depth, e.event_name AS prerequisite FROM chain c JOIN event e ON e.event_id = c.prerequisite_event_id;
