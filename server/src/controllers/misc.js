import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

export const venues = async (_q, res) => res.json((await query('SELECT * FROM venue_utilization ORDER BY venue_name')).rows);
export async function createVenue(req, res) {
  const b = req.body;
  const { rows } = await query('INSERT INTO venue(venue_name, building, floor, capacity, venue_type, status) VALUES ($1,$2,COALESCE($3,0),$4,$5,COALESCE($6,\'AVAILABLE\')) RETURNING *',
    [b.venue_name, b.building, b.floor, b.capacity, b.venue_type, b.status]);
  res.status(201).json(rows[0]);
}
export async function updateVenue(req, res) {
  const b = req.body;
  const { rows } = await query(`UPDATE venue SET venue_name = COALESCE($2, venue_name), building = COALESCE($3, building), floor = COALESCE($4, floor),
    capacity = COALESCE($5, capacity), venue_type = COALESCE($6, venue_type), status = COALESCE($7, status) WHERE venue_id = $1 RETURNING *`,
    [req.params.id, b.venue_name, b.building, b.floor, b.capacity, b.venue_type, b.status]);
  if (!rows[0]) throw new HttpError(404, 'Venue not found');
  res.json(rows[0]);
}
export async function availableVenues(req, res) {
  const { start, end, min_capacity } = req.query;
  if (!start || !end) throw new HttpError(400, 'start and end are required');
  res.json((await query('SELECT * FROM get_available_venues($1,$2,$3)', [start, end, min_capacity || 0])).rows);
}

export const attendance = async (req, res) => res.json((await query(`SELECT r.event_id, r.participant_id, u.name, p.registration_number, a.attendance_status, a.check_in_time, a.check_out_time
  FROM registration r JOIN participant p ON p.participant_id = r.participant_id JOIN users u ON u.user_id = p.user_id
  LEFT JOIN attendance a ON a.event_id = r.event_id AND a.participant_id = r.participant_id
  WHERE r.event_id = $1 AND r.status = 'REGISTERED' ORDER BY p.registration_number`, [req.params.eventId])).rows);
export async function markAttendance(req, res) {
  const { event_id, participant_id, attendance_status } = req.body;
  const { rows } = await query(`INSERT INTO attendance(event_id, participant_id, attendance_status, check_in_time)
    VALUES ($1,$2,$3, CASE WHEN $3 = 'ABSENT' THEN NULL ELSE now() END)
    ON CONFLICT (event_id, participant_id) DO UPDATE SET attendance_status = EXCLUDED.attendance_status,
      check_in_time = CASE WHEN EXCLUDED.attendance_status = 'ABSENT' THEN NULL ELSE COALESCE(attendance.check_in_time, now()) END RETURNING *`,
    [event_id, participant_id, attendance_status]);
  res.json(rows[0]);
}

export const results = async (req, res) => res.json((await query(`SELECT r.event_id, r.participant_id, u.name, p.registration_number, er.position, er.score, er.remarks
  FROM registration r JOIN participant p ON p.participant_id = r.participant_id JOIN users u ON u.user_id = p.user_id
  LEFT JOIN event_result er ON er.event_id = r.event_id AND er.participant_id = r.participant_id
  WHERE r.event_id = $1 AND r.status = 'REGISTERED' ORDER BY er.position NULLS LAST, p.registration_number`, [req.params.eventId])).rows);
export async function saveResult(req, res) {
  const { event_id, participant_id, position, score, remarks } = req.body;
  const { rows } = await query(`INSERT INTO event_result(event_id, participant_id, position, score, remarks) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (event_id, participant_id) DO UPDATE SET position = EXCLUDED.position, score = EXCLUDED.score, remarks = EXCLUDED.remarks RETURNING *`,
    [event_id, participant_id, position || null, score ?? null, remarks || null]);
  res.json(rows[0]);
}
