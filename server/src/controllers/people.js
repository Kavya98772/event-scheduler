import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

export const participants = async (_q, res) => res.json((await query(`SELECT p.participant_id, u.name, u.email, u.phone, p.registration_number, p.department, p.year,
  (SELECT count(*)::int FROM registration r WHERE r.participant_id = p.participant_id AND r.status = 'REGISTERED') AS events_registered
  FROM participant p JOIN users u ON u.user_id = p.user_id ORDER BY p.registration_number`)).rows);

export const participantSchedule = async (req, res) =>
  res.json((await query('SELECT * FROM participant_schedule WHERE participant_id = $1 ORDER BY start_time', [req.params.id])).rows);

export const judges = async (_q, res) => res.json((await query(`SELECT j.*, u.name, u.email,
  (SELECT count(*)::int FROM judge_assignment ja WHERE ja.judge_id = j.judge_id) AS assignments
  FROM judge j JOIN users u ON u.user_id = j.user_id ORDER BY u.name`)).rows);
export const volunteers = async (_q, res) => res.json((await query(`SELECT v.*, u.name, u.email,
  (SELECT count(*)::int FROM volunteer_assignment va WHERE va.volunteer_id = v.volunteer_id) AS assignments
  FROM volunteer v JOIN users u ON u.user_id = v.user_id ORDER BY u.name`)).rows);

export async function setAvailability(table, idCol, req, res) {
  const { rows } = await query(`UPDATE ${table} SET availability_status = $2 WHERE ${idCol} = $1 RETURNING *`, [req.params.id, req.body.availability_status]);
  if (!rows[0]) throw new HttpError(404, 'Not found');
  res.json(rows[0]);
}
export const updateJudge = (req, res) => setAvailability('judge', 'judge_id', req, res);
export const updateVolunteer = (req, res) => setAvailability('volunteer', 'volunteer_id', req, res);

// Assignments: event_id is derived from the schedule, so the composite FK can never disagree.
export const judgeAssignments = async (_q, res) => res.json((await query(`SELECT ja.assignment_id, ja.judge_id, u.name AS judge_name, ja.schedule_id, e.event_name, v.venue_name, s.start_time, s.end_time
  FROM judge_assignment ja JOIN judge j ON j.judge_id = ja.judge_id JOIN users u ON u.user_id = j.user_id
  JOIN event_schedule s ON s.schedule_id = ja.schedule_id JOIN event e ON e.event_id = s.event_id JOIN venue v ON v.venue_id = s.venue_id ORDER BY s.start_time`)).rows);
export async function assignJudge(req, res) {
  const { rows } = await query('INSERT INTO judge_assignment(judge_id, event_id, schedule_id) SELECT $1, event_id, schedule_id FROM event_schedule WHERE schedule_id = $2 RETURNING *',
    [req.body.judge_id, req.body.schedule_id]);
  if (!rows[0]) throw new HttpError(404, 'Schedule not found');
  res.status(201).json(rows[0]);
}
export const unassignJudge = async (req, res) => { await query('DELETE FROM judge_assignment WHERE assignment_id = $1', [req.params.id]); res.status(204).end(); };

export const volunteerAssignments = async (_q, res) => res.json((await query(`SELECT va.assignment_id, va.volunteer_id, u.name AS volunteer_name, va.responsibility, va.schedule_id, e.event_name, s.start_time, s.end_time
  FROM volunteer_assignment va JOIN volunteer vo ON vo.volunteer_id = va.volunteer_id JOIN users u ON u.user_id = vo.user_id
  JOIN event_schedule s ON s.schedule_id = va.schedule_id JOIN event e ON e.event_id = s.event_id ORDER BY s.start_time`)).rows);
export async function assignVolunteer(req, res) {
  const { rows } = await query('INSERT INTO volunteer_assignment(volunteer_id, event_id, schedule_id, responsibility) SELECT $1, event_id, schedule_id, $3 FROM event_schedule WHERE schedule_id = $2 RETURNING *',
    [req.body.volunteer_id, req.body.schedule_id, req.body.responsibility || 'Support']);
  if (!rows[0]) throw new HttpError(404, 'Schedule not found');
  res.status(201).json(rows[0]);
}
export const unassignVolunteer = async (req, res) => { await query('DELETE FROM volunteer_assignment WHERE assignment_id = $1', [req.params.id]); res.status(204).end(); };
