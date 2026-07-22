import pg from 'pg';
import { env } from './config/env.js';

const { Pool, types } = pg;

// Postgres `date` columns (OID 1082) default to being parsed into JS Date
// objects, which then serialize to full UTC-midnight ISO timestamps in JSON
// responses (e.g. "2026-07-22T07:00:00.000Z" instead of "2026-07-22") —
// confusing in the UI and a timezone footgun given this whole app is PT-based.
// Return the raw 'YYYY-MM-DD' string as-is instead, everywhere, once.
types.setTypeParser(1082, (val) => val);

export const pool = env.databaseUrl
  ? new Pool({
      connectionString: env.databaseUrl,
      ssl: { rejectUnauthorized: false },
    })
  : null;

export async function query(text, params) {
  if (!pool) {
    throw new Error(
      'DATABASE_URL is not configured yet. Add it to server/.env (see .env.example) and restart the server.'
    );
  }
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  if (!pool) {
    throw new Error(
      'DATABASE_URL is not configured yet. Add it to server/.env (see .env.example) and restart the server.'
    );
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
