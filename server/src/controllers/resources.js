import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

export const list = async (_q, res) => res.json((await query('SELECT * FROM resource_utilization ORDER BY resource_name')).rows);
export async function create(req, res) {
  const b = req.body;
  const { rows } = await query('INSERT INTO resource(resource_name, resource_type, total_quantity, available_quantity) VALUES ($1,$2,$3,$3) RETURNING *', [b.resource_name, b.resource_type, b.total_quantity]);
  res.status(201).json(rows[0]);
}
export async function update(req, res) {
  const b = req.body;
  const { rows } = await query(`UPDATE resource SET resource_name = COALESCE($2, resource_name), resource_type = COALESCE($3, resource_type),
    available_quantity = available_quantity + COALESCE($4, total_quantity) - total_quantity,
    total_quantity = COALESCE($4, total_quantity), status = COALESCE($5, status) WHERE resource_id = $1 RETURNING *`,
    [req.params.id, b.resource_name, b.resource_type, b.total_quantity, b.status]);
  if (!rows[0]) throw new HttpError(404, 'Resource not found');
  res.json(rows[0]);
}
export const allocations = async (_q, res) => res.json((await query(`SELECT ra.allocation_id, r.resource_name, ra.quantity, ra.schedule_id, e.event_name, s.start_time, s.end_time, s.status
  FROM resource_allocation ra JOIN resource r ON r.resource_id = ra.resource_id JOIN event_schedule s ON s.schedule_id = ra.schedule_id
  JOIN event e ON e.event_id = s.event_id ORDER BY s.start_time, r.resource_name`)).rows);
export async function allocate(req, res) {
  const { rows } = await query('INSERT INTO resource_allocation(resource_id, event_id, schedule_id, quantity) SELECT $1, event_id, schedule_id, $3 FROM event_schedule WHERE schedule_id = $2 RETURNING *',
    [req.body.resource_id, req.body.schedule_id, req.body.quantity]);
  if (!rows[0]) throw new HttpError(404, 'Schedule not found');
  res.status(201).json(rows[0]);
}
export const deallocate = async (req, res) => { await query('DELETE FROM resource_allocation WHERE allocation_id = $1', [req.params.id]); res.status(204).end(); };
