import { query } from '../db/pool.js';

export async function dashboard(_req, res) {
  await query('SELECT refresh_schedule_statuses()');
  const one = async (sql) => Object.values((await query(sql)).rows[0])[0];
  const [total_events, upcoming_events, total_participants, available_venues, active_judges, open_conflicts, recent_conflict_count] = await Promise.all([
    one('SELECT count(*)::int FROM event'),
    one('SELECT count(DISTINCT event_id)::int FROM upcoming_events'),
    one('SELECT count(*)::int FROM participant'),
    one("SELECT count(*)::int FROM venue WHERE status = 'AVAILABLE'"),
    one("SELECT count(*)::int FROM judge WHERE availability_status = 'AVAILABLE'"),
    one('SELECT count(*)::int FROM participant_conflicts'),
    one("SELECT count(*)::int FROM scheduling_conflict_log WHERE logged_at > now() - interval '30 days'")]);
  const [schedule, registrations, conflicts, resources] = await Promise.all([
    query('SELECT * FROM upcoming_events ORDER BY start_time LIMIT 8'),
    query(`SELECT r.registration_date, u.name AS participant_name, e.event_name FROM registration r JOIN participant p ON p.participant_id = r.participant_id
           JOIN users u ON u.user_id = p.user_id JOIN event e ON e.event_id = r.event_id WHERE r.status = 'REGISTERED' ORDER BY r.registration_id DESC LIMIT 8`),
    query(`SELECT l.logged_at, l.conflict_type, l.message, e.event_name FROM scheduling_conflict_log l LEFT JOIN event e ON e.event_id = l.event_id ORDER BY l.logged_at DESC LIMIT 6`),
    query('SELECT resource_name, total_quantity, upcoming_units, unit_hours FROM resource_utilization ORDER BY unit_hours DESC LIMIT 6')]);
  res.json({ stats: { total_events, upcoming_events, total_participants, available_venues, active_judges, open_conflicts, recent_conflict_count },
    upcoming_schedule: schedule.rows, recent_registrations: registrations.rows, recent_conflicts: conflicts.rows, resource_utilization: resources.rows });
}

export async function analytics(_req, res) {
  const q = async (sql) => (await query(sql)).rows;
  const [popular, attendance, byType, venues, resources, judges, volunteers, departments, highest] = await Promise.all([
    q('SELECT event_name, registered, popularity_rank FROM event_statistics ORDER BY popularity_rank, event_name LIMIT 10'),
    q('SELECT event_name, registered, attended, attendance_pct FROM event_statistics WHERE attendance_pct IS NOT NULL ORDER BY attendance_pct DESC'),
    q(`SELECT type_name, count(*)::int AS events, ROUND(AVG(attendance_pct), 1) AS avg_attendance_pct, ROUND(AVG(registered), 1) AS avg_registrations
       FROM event_statistics GROUP BY type_name ORDER BY avg_registrations DESC`),
    q('SELECT venue_name, sessions, booked_hours, avg_fill_pct, usage_rank FROM venue_utilization ORDER BY usage_rank, venue_name'),
    q('SELECT resource_name, total_quantity, allocations, unit_hours, upcoming_units FROM resource_utilization ORDER BY unit_hours DESC'),
    q(`SELECT u.name, count(ja.assignment_id)::int AS assignments, ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0), 0)::numeric, 1) AS hours,
              RANK() OVER (ORDER BY count(ja.assignment_id) DESC) AS workload_rank
       FROM judge j JOIN users u ON u.user_id = j.user_id LEFT JOIN judge_assignment ja ON ja.judge_id = j.judge_id
       LEFT JOIN event_schedule s ON s.schedule_id = ja.schedule_id GROUP BY j.judge_id, u.name ORDER BY assignments DESC, u.name`),
    q(`SELECT u.name, count(va.assignment_id)::int AS assignments, ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0), 0)::numeric, 1) AS hours,
              RANK() OVER (ORDER BY count(va.assignment_id) DESC) AS workload_rank
       FROM volunteer v JOIN users u ON u.user_id = v.user_id LEFT JOIN volunteer_assignment va ON va.volunteer_id = v.volunteer_id
       LEFT JOIN event_schedule s ON s.schedule_id = va.schedule_id GROUP BY v.volunteer_id, u.name ORDER BY assignments DESC, u.name`),
    q(`WITH dept AS (SELECT p.department, count(*)::int AS registrations, count(DISTINCT r.participant_id)::int AS students
         FROM registration r JOIN participant p ON p.participant_id = r.participant_id WHERE r.status = 'REGISTERED' GROUP BY p.department)
       SELECT department, registrations, students, ROUND(100.0 * registrations / SUM(registrations) OVER (), 1) AS pct FROM dept ORDER BY registrations DESC`),
    q(`SELECT event_name, registered, max_participants, ROUND(100.0 * registered / max_participants, 1) AS fill_pct FROM event_statistics ORDER BY fill_pct DESC LIMIT 5`)]);
  res.json({ popular, attendance, byType, venues, resources, judges, volunteers, departments, highest,
    average_attendance_pct: attendance.length ? (attendance.reduce((a, r) => a + Number(r.attendance_pct), 0) / attendance.length).toFixed(1) : null });
}
