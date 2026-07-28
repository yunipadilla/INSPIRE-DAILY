import { query } from '../db.js';

/**
 * Invalidates any prior outstanding tokens for this user, then inserts the
 * new one. Keeping at most one live token per user avoids accumulating
 * forgotten links that would otherwise all remain valid simultaneously.
 */
export async function createResetToken(userId, tokenHash, expiresAt) {
  await query(
    `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
    [userId]
  );
  await query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

/**
 * Atomically claims a token: only succeeds if it exists, is unexpired, and
 * hasn't been used yet — and marks it used in the same statement, so two
 * concurrent requests with the same token can never both succeed (avoids a
 * check-then-use race).
 *
 * Takes a `client` (from withTransaction) rather than using the pool
 * directly — this must run in the same transaction as the password update
 * it gates (see routes/auth.js), so that if the password update fails for
 * any reason, the token's used_at is rolled back along with it. A token
 * must never be burned without the password actually having changed.
 */
export async function claimResetToken(client, tokenHash) {
  const { rows } = await client.query(
    `update password_reset_tokens
       set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning user_id`,
    [tokenHash]
  );
  return rows[0]?.user_id || null;
}
