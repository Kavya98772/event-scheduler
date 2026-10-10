import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

const REG = `(SELECT count(*)::int FROM registration r WHERE r.event_id = e.event_id AND r.status = 'REGISTERED')`;
const BASE = `SELECT e.*, et.type_name, u.name AS organizer_name, ${REG} AS registered FROM event e
  JOIN event_type et ON et.event_type_id = e.event_type_id JOIN users u ON u.user_id = e.organizer_id`;

async function assertOwns(req, id) {
  const { rows: [e] } = await query('SELECT organizer_id FROM event WHERE event_id = $1', [id]);
  if (!e) throw new HttpError(404, 'Event not found');
  if (req.user.role !== 'ADMIN' && e.organizer_id !== req.user.id) throw new HttpError(403, 'You do not own this event');
}
const participantOf = async (userId) => {
  const { rows: [p] } = await query('SELECT participant_id FROM participant WHERE user_id = $1', [userId]);
  if (!p) throw new HttpError(403, 'Only participants can register for events');
  return p.participant_id;
};

export const types = async (_q, res) => res.json((await query('SELECT * FROM event_type ORDER BY type_name')).rows);

export async function list(req, res) {
  const { rows } = await query(`SELECT x.*, (SELECT min(s.start_time) FROM event_schedule s WHERE s.event_id = x.event_id AND s.status <> 'CANCELLED') AS next_start
    FROM (${BASE}) x WHERE ($1::text IS NULL OR x.status = $1) ORDER BY x.created_at DESC, x.event_id DESC`, [req.query.status || null]);
  res.json(rows);
}

export async function get(req, res) {
  const id = Number(req.params.id);
  const { rows: [e] } = await query(`${BASE} WHERE e.event_id = $1`, [id]);
  if (!e) throw new HttpError(404, 'Event not found');
  const schedules = (await query('SELECT * FROM venue_schedule WHERE event_id = $1 ORDER BY start_time', [id])).rows;
  const dependencies = (await query(`SELECT d.dependency_id, d.dependency_type, p.event_id AS prerequisite_event_id, p.event_name AS prerequisite_name
    FROM event_dependency d JOIN event p ON p.event_id = d.prerequisite_event_id WHERE d.event_id = $1`, [id])).rows;
  let my_registration = null;
  if (req.user.role === 'PARTICIPANT') {
    my_registration = (await query(`SELECT r.status FROM registration r JOIN participant p ON p.participant_id = r.participant_id
      WHERE r.event_id = $1 AND p.user_id = $2`, [id, req.user.id])).rows[0]?.status || null;
  }
  res.json({ ...e, schedules, dependencies, my_registration });
}

export async function create(req, res) {
  const b = req.body;
  const { rows } = await query(`INSERT INTO event(event_name, description, event_type_id, organizer_id, max_participants, duration_minutes, registration_deadline, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'DRAFT')) RETURNING *`,
    [b.event_name, b.description || null, b.event_type_id, req.user.id, b.max_participants, b.duration_minutes, b.registration_deadline, b.status || null]);
  res.status(201).json(rows[0]);
}

export async function update(req, res) {
  await assertOwns(req, req.params.id);
  const b = req.body;
  const { rows } = await query(`UPDATE event SET event_name = COALESCE($2, event_name), description = COALESCE($3, description),
    event_type_id = COALESCE($4, event_type_id), max_participants = COALESCE($5, max_participants), duration_minutes = COALESCE($6, duration_minutes),
    registration_deadline = COALESCE($7, registration_deadline), status = COALESCE($8, status) WHERE event_id = $1 RETURNING *`,
    [req.params.id, b.event_name, b.description, b.event_type_id, b.max_participants, b.duration_minutes, b.registration_deadline, b.status]);
  res.json(rows[0]);
}

export async function remove(req, res) {
  await assertOwns(req, req.params.id);
  await query('DELETE FROM event WHERE event_id = $1', [req.params.id]);
  res.status(204).end();
}

export async function register(req, res) {
  const pid = await participantOf(req.user.id);
  const re = await query(`UPDATE registration SET status = 'REGISTERED', registration_date = now()
    WHERE event_id = $1 AND participant_id = $2 AND status IN ('CANCELLED','WAITLISTED') RETURNING *`, [req.params.id, pid]);
  if (re.rows[0]) return res.status(200).json(re.rows[0]);
  const { rows } = await query('INSERT INTO registration(event_id, participant_id) VALUES ($1,$2) RETURNING *', [req.params.id, pid]);
  res.status(201).json(rows[0]);
}

export async function unregister(req, res) {
  const pid = await participantOf(req.user.id);
  const { rowCount } = await query("UPDATE registration SET status = 'CANCELLED' WHERE event_id = $1 AND participant_id = $2 AND status <> 'CANCELLED'", [req.params.id, pid]);
  if (!rowCount) throw new HttpError(404, 'You are not registered for this event');
  res.status(204).end();
}

export async function registrations(req, res) {
  const { rows } = await query(`SELECT r.registration_id, r.status, r.registration_date, p.participant_id, p.registration_number, p.department, p.year, u.name, u.email
    FROM registration r JOIN participant p ON p.participant_id = r.participant_id JOIN users u ON u.user_id = p.user_id
    WHERE r.event_id = $1 ORDER BY r.registration_date, r.registration_id`, [req.params.id]);
  res.json(rows);
}

export async function addDependency(req, res) {
  await assertOwns(req, req.params.id);
  const { rows } = await query('INSERT INTO event_dependency(event_id, prerequisite_event_id, dependency_type) VALUES ($1,$2,COALESCE($3,\'MUST_COMPLETE_BEFORE\')) RETURNING *',
    [req.params.id, req.body.prerequisite_event_id, req.body.dependency_type]);
  res.status(201).json(rows[0]);
}
export async function removeDependency(req, res) {
  await assertOwns(req, req.params.id);
  await query('DELETE FROM event_dependency WHERE dependency_id = $1 AND event_id = $2', [req.params.depId, req.params.id]);
  res.status(204).end();
}
