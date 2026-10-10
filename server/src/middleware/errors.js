export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const CONFLICT = { SC001: 'VENUE', SC002: 'CAPACITY', SC003: 'PARTICIPANT', SC004: 'JUDGE', SC005: 'VOLUNTEER',
  SC006: 'RESOURCE', SC007: 'DEPENDENCY', SC008: 'DEADLINE' };
export const conflictTypeOf = (err) => (err.code === '23P01' ? 'VENUE' : CONFLICT[err.code] || null);

// Maps PostgreSQL SQLSTATE codes (incl. our custom SC0xx codes) to HTTP responses.
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message;
  const c = err.code;
  if (typeof c === 'string') {
    if (c === '23505') { status = 409; message = 'Duplicate value: ' + (err.detail || err.message); }
    else if (c === '23503') { status = 409; message = 'Referenced record is missing or still in use: ' + (err.detail || err.message); }
    else if (c === '23P01') { status = 409; message = 'Venue conflict: the venue is already booked for an overlapping time range'; }
    else if (['23514', '23502', '22P02', '22007', '22008', '22003'].includes(c)) { status = 400; }
    else if (c === 'SC010') status = 404;
    else if (c === 'SC011') status = 400;
    else if (/^SC0/.test(c)) status = 409;
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ error: { code: c || 'ERROR', type: conflictTypeOf(err), message: status >= 500 ? 'Internal server error' : message, details: err.details || err.detail || null } });
}
