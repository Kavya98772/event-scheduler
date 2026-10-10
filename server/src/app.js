import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './config.js';
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errors.js';
import { query } from './db/pool.js';

const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', async (_req, res, next) => {
  try { await query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); } catch (e) { next(e); }
});
app.use('/api', routes);
app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));

// Serve the built React app (npm run build in client/) so one process runs everything.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errorHandler);

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
