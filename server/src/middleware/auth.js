import jwt from 'jsonwebtoken';
import { SECRET } from '../config.js';
import { HttpError } from './errors.js';

export function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  try { req.user = jwt.verify(h.replace('Bearer ', ''), SECRET); next(); }
  catch { next(new HttpError(401, 'Authentication required')); }
}
export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do this'));
export const staff = requireRole('ADMIN', 'ORGANIZER');
