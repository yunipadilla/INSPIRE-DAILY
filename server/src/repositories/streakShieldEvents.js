/**
 * Auditable shield-event ledger — narrow additive table (Inspire 2.4 shield
 * rebuild). Every earn/consume/admin-correction is recorded here so shield
 * inventory is never a guess derived from streak arithmetic (e.g.
 * floor(streak / 7), which breaks the moment a shield is ever consumed —
 * see streakEngine.js's module doc comment). `users.streak_shields` remains
 * the fast, authoritative "current available" value for reads; this table
 * is the audit trail behind it and the source for HQ's Shield History view.
 *
 * amount is +1 for 'earned', -1 for 'consumed', and whatever an
 * 'admin_correction' actually adjusts by (can be any integer, positive or
 * negative) — summing amount across a user's events always equals their
 * current streak_shields (mod the 0-3 clamp applied at write time), giving
 * a genuine audit identity rather than two numbers that can silently drift
 * apart.
 */
import { query } from '../db.js';

export async function insertShieldEvent({ userId, eventType, amount, streakValue = null, eventDate, reason = null, client = null }) {
  const runner = client ? (text, params) => client.query(text, params) : query;
  const { rows } = await runner(
    `insert into streak_shield_events (user_id, event_type, amount, streak_value, event_date, reason)
     values ($1,$2,$3,$4,$5,$6)
     returning *`,
    [userId, eventType, amount, streakValue, eventDate, reason]
  );
  return rows[0];
}

/** Every date this user has ever had a shield consume-bridge a gap for —
 * NOT just an audit convenience. The streak calculation itself (see
 * streakEngine.js's calculateStreakWithShields) must treat these dates as
 * permanently resolved, exactly like a real submission for continuity
 * purposes, or a later reconciliation pass — now finding the shield already
 * spent — would re-discover the same historical gap as unprotected and
 * forfeit the streak all over again. This is what makes shield consumption
 * genuinely idempotent rather than a one-time trick that unravels the next
 * time reconciliation runs. */
export async function listBridgedDatesForUser(userId) {
  const { rows } = await query(
    `select event_date::text as event_date from streak_shield_events where user_id = $1 and event_type = 'consumed'`,
    [userId]
  );
  return rows.map((r) => r.event_date);
}

/** Full history for one user, most recent first — HQ Member Profile's
 * read-only Shield History panel. */
export async function listShieldEventsForUser(userId, limit = 50) {
  const { rows } = await query(
    `select id, event_type, amount, streak_value, event_date, reason, created_at
       from streak_shield_events
      where user_id = $1
      order by event_date desc, created_at desc
      limit $2`,
    [userId, limit]
  );
  return rows;
}
