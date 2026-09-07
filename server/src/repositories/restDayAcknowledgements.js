/**
 * Narrow, dedicated acknowledgement of "Sunday was a rest day" — deliberately
 * NOT a daily_scores or summer_entries row (those must never hold fake
 * activity for a day nothing was required). `source` distinguishes the
 * Daily Scores flow from the Inspire Challenge flow, since each surfaces
 * its own confirmation independently.
 */
import { query } from '../db.js';

export async function findAcknowledgement(userId, restDate, source) {
  const { rows } = await query(
    'select * from rest_day_acknowledgements where user_id = $1 and rest_date = $2 and source = $3',
    [userId, restDate, source]
  );
  return rows[0] || null;
}

export async function acknowledgeRestDay(userId, restDate, source) {
  const { rows } = await query(
    `insert into rest_day_acknowledgements (user_id, rest_date, source)
     values ($1, $2, $3)
     on conflict (user_id, rest_date, source) do update set acknowledged_at = rest_day_acknowledgements.acknowledged_at
     returning *`,
    [userId, restDate, source]
  );
  return rows[0];
}
