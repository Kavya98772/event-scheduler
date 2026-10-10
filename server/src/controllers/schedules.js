import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import * as svc from '../services/scheduling.js';

export const preview = async (req, res) => res.json(await svc.preview(req.body));
export async function create(req, res) {
  const id = await svc.create(req.body, req.user);
  res.status(201).json({ schedule_id: id });
}
export async function list(req, res) {
  await query('SELECT refresh_schedule_statuses()');
  const { rows } = await query(`SELECT * FROM venue_schedule WHERE ($1::timestamptz IS NULL OR end_time >= $1) AND ($2::timestamptz IS NULL OR start_time <= $2)
    ORDER BY start_time`, [req.query.from || null, req.query.to || null]);
  res.json(rows);
}
export async function get(req, res) {
  const id = Number(req.params.id);
  const { rows: [s] } = await query('SELECT * FROM venue_schedule WHERE schedule_id = $1', [id]);
  if (!s) throw new HttpError(404, 'Schedule not found');
  s.volunteers = (await query('SELECT volunteer_name, responsibility FROM volunteer_schedule WHERE schedule_id = $1', [id])).rows;
  s.resources = (await query(`SELECT r.resource_name, ra.quantity FROM resource_allocation ra JOIN resource r ON r.resource_id = ra.resource_id WHERE ra.schedule_id = $1`, [id])).rows;
  res.json(s);
}
export const update = async (req, res) => res.json(await svc.update(req.params.id, req.body, req.user));
export const cancel = async (req, res) => { await svc.cancel(req.params.id, req.user); res.json({ cancelled: true }); };
export const remove = async (req, res) => { await svc.remove(req.params.id, req.user); res.status(204).end(); };
