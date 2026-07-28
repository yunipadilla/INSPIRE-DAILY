import crypto from 'node:crypto';

export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;

/**
 * Generates a fresh reset token. `raw` is what goes in the emailed link and
 * is never persisted anywhere — only `hash` (its SHA-256 digest) is stored,
 * so a database read alone can never yield a usable token. SHA-256 (not
 * bcrypt) is deliberate and correct here: the input is already 256 bits of
 * `crypto.randomBytes` entropy, not a low-entropy human password, so a fast
 * deterministic hash is exactly what a lookup-by-hash needs — slow salted
 * hashing would only make the legitimate lookup slower for zero security
 * benefit against an input space this large.
 */
export function generateResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = hashResetToken(raw);
  return { raw, hash };
}

export function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function resetTokenExpiresAt(now = new Date()) {
  return new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
}
