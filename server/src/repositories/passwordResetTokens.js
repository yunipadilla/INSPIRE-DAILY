import { query } from '../db.js';

/**
 * Replaces any prior outstanding tokens for this user with a new one, in one
 * transaction (so a failure can never leave the user with no valid token and
 * the old one already burned). Keeping at most one live token per user
 * avoids accumulating forgotten links that would all stay valid at once.
 *
 * `used_at` is set both when a token is redeemed and when it is superseded
 * by a newer request — either way it can never be redeemed again.
 */
export async function createResetToken(client, userId, tokenHash, expiresAt) {
  await client.query(
    `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
    [userId]
  );
  await client.query(
    `insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

/** When the user's most recent reset token was created (null if never) —
 * used to throttle repeat emails to the same inbox. */
export async function latestResetTokenCreatedAt(userId) {
  const { rows } = await query(
    `select max(created_at) as created_at from password_reset_tokens where user_id = $1`,
    [userId]
  );
  return rows[0]?.created_at ? new Date(rows[0].created_at) : null;
}

/**
 * Atomically claims a token: only succeeds if it exists, is unexpired, and
 * hasn't been used yet — and marks it used in the same statement, so two
 * concurrent requests with the same token can never both succeed (avoids a
 * check-then-use race).
 *
 * Takes a `client` (from withTransaction) rather than using the pool
 * directly — this must run in the same transaction as the password update
 * it gates, so that if the password update fails for any reason, the
 * token's used_at is rolled back along with it. A token must never be
 * burned without the password actually having changed.
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

/** After a successful reset, kill every other outstanding link for the user. */
export async function invalidateAllResetTokens(client, userId) {
  await client.query(
    `update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null`,
    [userId]
  );
}
