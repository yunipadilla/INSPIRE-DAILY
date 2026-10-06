/**
 * Password recovery: request a reset link, then redeem it.
 *
 * Security properties (each is covered by test/integration/passwordReset):
 *  - Tokens are 256-bit random values; only their SHA-256 hash is stored.
 *  - Tokens expire (PASSWORD_RESET_TOKEN_TTL_MINUTES), are single use, and a
 *    new request supersedes any older outstanding link.
 *  - requestPasswordReset never reveals whether the email has an account, and
 *    never throws because of email-provider trouble.
 *  - Redeeming a token and changing the password is one transaction.
 *  - A reset touches only password_hash / password_changed_at.
 *  - Neither the raw token, the link, nor any password is ever logged.
 */
import bcrypt from 'bcryptjs';
import { withTransaction } from '../db.js';
import { findByEmail, updatePasswordHash } from '../repositories/users.js';
import {
  createResetToken,
  claimResetToken,
  latestResetTokenCreatedAt,
  invalidateAllResetTokens,
} from '../repositories/passwordResetTokens.js';
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiresAt,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
} from '../lib/passwordReset.js';
import { passwordResetUrl } from '../lib/appUrl.js';
import { sendEmail } from './email.js';

const BCRYPT_ROUNDS = 12; // same standard as signup
// Minimum gap between reset EMAILS to one account. Stops anyone from using
// the form to flood a participant's inbox (the per-IP limiter alone can be
// sidestepped from many IPs). The public response is identical either way.
export const RESET_EMAIL_COOLDOWN_MS = 60 * 1000;

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function buildResetEmail({ firstName, resetUrl }) {
  const name = escapeHtml(firstName || 'there');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2a44">
  <h2 style="margin:0 0 16px">Reset your Inspire Daily password</h2>
  <p>Hi ${name},</p>
  <p>We got a request to reset the password for your Inspire Daily account. Tap the button below to choose a new one.</p>
  <p style="margin:28px 0"><a href="${resetUrl}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;display:inline-block">Reset Password</a></p>
  <p style="font-size:14px;color:#55607a">This link expires in ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes and can only be used once. If the button doesn't work, copy and paste this address into your browser:</p>
  <p style="font-size:13px;word-break:break-all;color:#55607a">${resetUrl}</p>
  <p style="font-size:14px;color:#55607a">If you didn't ask for this, you can ignore this email — your password hasn't changed.</p>
  <p style="font-size:14px;color:#55607a">— Inspiring Children Foundation</p>
</div>`;
  const text = `Hi ${firstName || 'there'},

We got a request to reset the password for your Inspire Daily account. Open this link to choose a new one:

${resetUrl}

This link expires in ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes and can only be used once. If you didn't ask for this, you can ignore this email — your password hasn't changed.

— Inspiring Children Foundation`;
  return { subject: 'Reset your Inspire Daily password', html, text };
}

/**
 * Handles a forgot-password submission. Always resolves (never throws for an
 * unknown email, a cooldown, or an email-provider failure); the caller sends
 * the same neutral response regardless. Returns an internal outcome string
 * for tests/logging only — it must never be sent to the client.
 *
 * @param {string} email
 * @param {{ send?: typeof sendEmail, now?: Date }} [deps] - injectable for tests
 */
export async function requestPasswordReset(email, { send = sendEmail, now = new Date() } = {}) {
  let user;
  try {
    // Deliberately independent of account_status: a suspended account can
    // still complete a reset (it just can't log in afterward), so status
    // can never leak through this flow.
    user = await findByEmail(email);
    if (!user) return 'no_account';

    const last = await latestResetTokenCreatedAt(user.id);
    if (last && now.getTime() - last.getTime() < RESET_EMAIL_COOLDOWN_MS) return 'cooldown';

    const { raw, hash } = generateResetToken();
    await withTransaction((client) => createResetToken(client, user.id, hash, resetTokenExpiresAt(now)));

    const mail = buildResetEmail({ firstName: user.first_name, resetUrl: passwordResetUrl(raw) });
    const result = await send({ to: user.email, ...mail, sensitive: true });
    if (result?.stubbed) {
      console.error(`[passwordReset] NO EMAIL PROVIDER CONFIGURED — reset link for user ${user.id} was NOT delivered`);
      return 'stubbed';
    }
    return 'sent';
  } catch (err) {
    // Provider/DB trouble must not change the public response (that would
    // reveal which emails have accounts). Log enough to diagnose — user id
    // and the error message, never the link, token, or email body.
    console.error(`[passwordReset] reset request failed${user ? ` for user ${user.id}` : ''}: ${err.message}`);
    return 'error';
  }
}

/**
 * Redeems a reset token and sets the new password in ONE transaction.
 * Returns the user id, or null if the token is invalid/expired/used (those
 * cases are deliberately indistinguishable to the caller).
 */
export async function completePasswordReset(rawToken, newPassword) {
  // Hash before opening the transaction — bcrypt is deliberately slow, and
  // there's no reason to hold a DB connection open for it.
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  return withTransaction(async (client) => {
    const userId = await claimResetToken(client, hashResetToken(rawToken));
    if (!userId) return null;
    // Only ever touches password_hash/password_changed_at — a reset can never
    // change app_role, system_role, or account_status.
    await updatePasswordHash(client, userId, passwordHash);
    await invalidateAllResetTokens(client, userId);
    return userId;
  });
}
