import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SECRET } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

const sign = (u) => jwt.sign({ id: u.user_id, role: u.role, name: u.name }, SECRET, { expiresIn: '8h' });
const pub = (u) => ({ id: u.user_id, name: u.name, email: u.email, role: u.role });

export async function login(req, res) {
  const { email = '', password = '' } = req.body;
  const { rows: [u] } = await query('SELECT user_id, name, email, role, password_hash FROM users WHERE lower(email) = lower($1)', [email]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: sign(u), user: pub(u) });
}

export async function register(req, res) {
  const { name, email, password, phone, registration_number, department, year } = req.body;
  if (!name || !email || !password || !registration_number || !department || !year)
    throw new HttpError(400, 'name, email, password, registration_number, department and year are required');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  const hash = await bcrypt.hash(password, 10);
  const u = await withTransaction(async (c) => {
    const { rows: [u] } = await c.query(
      "INSERT INTO users(name, email, phone, password_hash, role) VALUES ($1,$2,$3,$4,'PARTICIPANT') RETURNING user_id, name, email, role",
      [name, email, phone || null, hash]);
    await c.query('INSERT INTO participant(user_id, registration_number, department, year) VALUES ($1,$2,$3,$4)', [u.user_id, registration_number, department, year]);
    return u;
  });
  res.status(201).json({ token: sign(u), user: pub(u) });
}
