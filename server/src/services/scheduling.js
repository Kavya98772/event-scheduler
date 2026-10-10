import { query, withTransaction } from '../db/pool.js';
import { HttpError, conflictTypeOf } from '../middleware/errors.js';

const args = (b) => [b.event_id, b.venue_id, b.start_time, b.judge_ids || [], JSON.stringify(b.volunteers || []), JSON.stringify(b.resources || [])];

export async function preview(b) {
  if (!b.event_id || !b.venue_id || !b.start_time) throw new HttpError(400, 'event_id, venue_id and start_time are required');
  const { rows } = await query('SELECT check_name, passed, message, code FROM preview_schedule($1,$2,$3,$4::int[],$5::jsonb,$6::jsonb)', args(b));
  return { ok: rows.every((r) => r.passed), checks: rows };
}

async function assertOwns(user, eventId) {
  const { rows: [e] } = await query('SELECT organizer_id FROM event WHERE event_id = $1', [eventId]);
  if (!e) throw new HttpError(404, 'Event not found');
  if (user.role !== 'ADMIN' && e.organizer_id !== user.id) throw new HttpError(403, 'You can only schedule your own events');
}

// A rolled-back transaction cannot log its own failure, so the attempt is logged afterwards.
async function logConflict(err, b, user) {
  const type = conflictTypeOf(err);
  if (!type) return;
  await query(`INSERT INTO scheduling_conflict_log(event_id, attempted_by, venue_id, attempted_start, attempted_end, conflict_type, message)
               SELECT event_id, $2, $3, $4::timestamptz, $4::timestamptz + make_interval(mins => duration_minutes), $5, $6
               FROM event WHERE event_id = $1`, [b.event_id, user.id, b.venue_id, b.start_time, type, err.message]).catch(() => {});
}

export async function create(b, user) {
  if (!b.event_id || !b.venue_id || !b.start_time) throw new HttpError(400, 'event_id, venue_id and start_time are required');
  await assertOwns(user, b.event_id);
  try {
    return await withTransaction(async (c) => {
      const { rows } = await c.query('SELECT schedule_event($1,$2,$3,$4::int[],$5::jsonb,$6::jsonb) AS id', args(b));
      return rows[0].id;
    });
  } catch (err) { await logConflict(err, b, user); throw err; }
}

export async function update(id, b, user) {
  const { rows: [s] } = await query('SELECT event_id FROM event_schedule WHERE schedule_id = $1', [id]);
  if (!s) throw new HttpError(404, 'Schedule not found');
  await assertOwns(user, s.event_id);
  const { rows } = await query(`UPDATE event_schedule SET venue_id = COALESCE($2, venue_id),
      start_time = COALESCE($3::timestamptz, start_time),
      end_time = CASE WHEN $3::timestamptz IS NULL THEN end_time
                 ELSE $3::timestamptz + make_interval(mins => (SELECT duration_minutes FROM event WHERE event_id = event_schedule.event_id)) END
    WHERE schedule_id = $1 RETURNING *`, [id, b.venue_id || null, b.start_time || null]);
  return rows[0];
}

export async function cancel(id, user) {
  const { rows: [s] } = await query('SELECT event_id FROM event_schedule WHERE schedule_id = $1', [id]);
  if (!s) throw new HttpError(404, 'Schedule not found');
  await assertOwns(user, s.event_id);
  await query('SELECT cancel_schedule($1)', [id]);
}

export async function remove(id, user) {
  const { rows: [s] } = await query('SELECT event_id FROM event_schedule WHERE schedule_id = $1', [id]);
  if (!s) throw new HttpError(404, 'Schedule not found');
  await assertOwns(user, s.event_id);
  await query('DELETE FROM event_schedule WHERE schedule_id = $1', [id]); // cascades; triggers restore resources
  await query(`UPDATE event SET status = 'OPEN' WHERE event_id = $1 AND status = 'SCHEDULED'
               AND NOT EXISTS (SELECT 1 FROM event_schedule WHERE event_id = $1 AND status <> 'CANCELLED')`, [s.event_id]);
}
