/**
 * Shield-event ledger (read side). This table is an AUDIT RECORD of the
 * canonical replay (lib/streakEngine.js) — it is written only by
 * services/streakService.js and is never an input to streak math. A row the
 * replay no longer derives (e.g. a retroactive "consume" recorded by the
 * pre-2026-10-04 engine) is voided with a timestamp and reason, never
 * deleted, so the full history stays auditable.
 *
 * A partial unique index (streak_shield_events_one_per_day) guarantees at
 * most one active earned/consumed event per user per day.
 */
import { query } from '../db.js';

/** Active (non-voided) history for one user, most recent first — HQ Member
 * Profile's read-only Shield History panel. */
export async function listShieldEventsForUser(userId, limit = 50) {
  const { rows } = await query(
    `select id, event_type, amount, streak_value, event_date::text as event_date, reason, source, created_at
       from streak_shield_events
      where user_id = $1 and voided_at is null
      order by event_date desc, created_at desc
      limit $2`,
    [userId, limit]
  );
  return rows;
}

/** Count of voided rows (shown to staff as a footnote, not the rows themselves). */
export async function countVoidedShieldEventsForUser(userId) {
  const { rows } = await query(
    'select count(*)::int as n from streak_shield_events where user_id = $1 and voided_at is not null',
    [userId]
  );
  return rows[0].n;
}
