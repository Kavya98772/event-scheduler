// Runs the SQL files in /database against DATABASE_URL, in dependency order.
// Usage: npm run db:setup            (all files that exist)
//        npm run db:setup -- schema.sql seed.sql
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });
const dir = path.resolve(here, '../../../database');

const ORDER = ['schema', 'functions', 'triggers', 'views', 'indexes', 'seed'].map((n) => `${n}.sql`);
const args = process.argv.slice(2);
const files = args.length ? args : ORDER.filter((f) => fs.existsSync(path.join(dir, f)));

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const f of files) {
    await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    console.log('ok  ', f);
  }
} catch (err) {
  console.error('FAIL', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
