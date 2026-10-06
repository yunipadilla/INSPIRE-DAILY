// Integration tests for password recovery against the real database, using
// DISPOSABLE accounts that are fully deleted in `after`. Email sending is
// stubbed/injected — no real email is ever sent. Run explicitly (this
// database is shared with production):
//
//   npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import bcrypt from 'bcryptjs';
import { query, pool } from '../../src/db.js';
import { env } from '../../src/config/env.js';

// Never let a test reach a real email provider, whatever server/.env holds.
env.resendApiKey = '';
env.smtp.host = '';

const { requestPasswordReset, completePasswordReset, RESET_EMAIL_COOLDOWN_MS } = await import('../../src/services/passwordResetService.js');
const { default: authRoutes } = await import('../../src/routes/auth.js');
const { hashResetToken } = await import('../../src/lib/passwordReset.js');

const TAG = `qa-pwreset-integration-${Date.now()}`;
const OLD_PW = 'OldPassw0rd-qa';
const NEW_PW = 'NewPassw0rd-qa';
const users = {};
let server;
let base;

async function makeUser(label) {
  const { rows } = await query(
    `insert into users (email, password_hash, first_name, last_name, birthday, app_role, account_status, approved_at)
     values ($1, $2, 'QA', $3, '2000-01-01', 'intern', 'approved', now()) returning id, email`,
    [`${TAG}-${label}@example.com`, await bcrypt.hash(OLD_PW, 4), `PwReset-${label}`]
  );
  return rows[0];
}
const userRow = async (id) => (await query('select * from users where id = $1', [id])).rows[0];
const tokenRows = async (id) => (await query('select * from password_reset_tokens where user_id = $1 order by created_at', [id])).rows;

/** Capturing email sender: records what would be sent, returns like a real provider. */
function capture() {
  const sent = [];
  const send = async (mail) => { sent.push(mail); return { sent: true, stubbed: false, provider: 'test' }; };
  return { sent, send };
}
const tokenFromMail = (mail) => new URL(mail.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
async function post(path, body) {
  const res = await fetch(`${base}/api/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  users.target = await makeUser('target');
  users.bystander = await makeUser('bystander');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  for (const u of Object.values(users)) {
    await query('delete from password_reset_tokens where user_id = $1', [u.id]);
    await query('delete from users where id = $1', [u.id]);
  }
  const { rows } = await query(`select count(*)::int as n from users where email like 'qa-pwreset-integration-%'`);
  assert.equal(rows[0].n, 0, 'disposable accounts cleaned up');
  await pool.end();
});

test('A/C: known email -> one email with a production-shaped link; only the token HASH is stored', async () => {
  const { sent, send } = capture();
  const outcome = await requestPasswordReset(users.target.email, { send });
  assert.equal(outcome, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, users.target.email);
  assert.equal(sent[0].sensitive, true);
  assert.match(sent[0].text, /\/reset-password\?token=[0-9a-f]{64}/);
  assert.ok(sent[0].html.includes('Reset Password'));

  const raw = tokenFromMail(sent[0]);
  const rows = await tokenRows(users.target.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, hashResetToken(raw));
  assert.notEqual(rows[0].token_hash, raw);
  const ttlMin = (new Date(rows[0].expires_at) - new Date(rows[0].created_at)) / 60000;
  assert.ok(ttlMin > 59 && ttlMin < 61, `expires in ~60 min (got ${ttlMin})`);
  assert.equal(rows[0].used_at, null);
});

test('B: unknown email -> no email, no token, and the PUBLIC response is identical to a known email', async () => {
  const { sent, send } = capture();
  assert.equal(await requestPasswordReset(`nobody-${TAG}@example.com`, { send }), 'no_account');
  assert.equal(sent.length, 0);

  const known = await post('/forgot-password', { email: users.bystander.email });
  const unknown = await post('/forgot-password', { email: `nobody-${TAG}@example.com` });
  const malformed = await post('/forgot-password', { email: 'not-an-email' });
  // The route sends in the background; let it settle before later tests touch this user's tokens.
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual(known, unknown);
  assert.deepEqual(known, malformed);
  assert.equal(known.status, 200);
  assert.equal(known.body.message, "If an account exists for that email, we've sent a password reset link.");
});

test('provider failure or missing provider never changes the public outcome and never throws', async () => {
  const bystanderBefore = await userRow(users.bystander.id);
  const failing = async () => { throw new Error('Resend rejected the email (HTTP 403): domain is not verified'); };
  const later = new Date(Date.now() + 10 * RESET_EMAIL_COOLDOWN_MS);
  assert.equal(await requestPasswordReset(users.bystander.email, { send: failing, now: later }), 'error');
  const stub = async () => ({ sent: false, stubbed: true, provider: 'stub' });
  const later2 = new Date(later.getTime() + 2 * RESET_EMAIL_COOLDOWN_MS);
  assert.equal(await requestPasswordReset(users.bystander.email, { send: stub, now: later2 }), 'stubbed');
  assert.equal((await userRow(users.bystander.id)).password_hash, bystanderBefore.password_hash);
});

test('cooldown: a repeat request within a minute sends no second email', async () => {
  await query('delete from password_reset_tokens where user_id = $1', [users.target.id]);
  const { sent, send } = capture();
  assert.equal(await requestPasswordReset(users.target.email, { send }), 'sent');
  assert.equal(await requestPasswordReset(users.target.email, { send }), 'cooldown');
  assert.equal(sent.length, 1);
  assert.equal((await tokenRows(users.target.id)).length, 1, 'no extra token minted during cooldown');
});

test('D/E/F/G/H/I/J/K/L: full lifecycle on the target; bystander untouched', async () => {
  // Fresh, clean state for the target.
  await query('delete from password_reset_tokens where user_id = $1', [users.target.id]);
  const targetBefore = await userRow(users.target.id);
  const bystanderBefore = await userRow(users.bystander.id);
  const bystanderTokensBefore = await tokenRows(users.bystander.id);

  const { sent, send } = capture();
  assert.equal(await requestPasswordReset(users.target.email, { send }), 'sent');
  const raw = tokenFromMail(sent[0]);

  // E invalid token rejected
  assert.equal(await completePasswordReset('f'.repeat(64), NEW_PW), null);
  assert.equal(await completePasswordReset('garbage', NEW_PW), null);

  // F expired token rejected (and the password is NOT changed)
  await query(`update password_reset_tokens set expires_at = now() - interval '1 minute' where user_id = $1`, [users.target.id]);
  assert.equal(await completePasswordReset(raw, NEW_PW), null);
  assert.equal((await userRow(users.target.id)).password_hash, targetBefore.password_hash, 'expired token did not change the password');
  await query(`update password_reset_tokens set expires_at = now() + interval '30 minutes' where user_id = $1`, [users.target.id]);

  // I (before reset) old password authenticates over HTTP
  const loginOld = await post('/login', { email: users.target.email, password: OLD_PW });
  assert.equal(loginOld.status, 200);

  // D valid token accepted; H password changes
  assert.equal(await completePasswordReset(raw, NEW_PW), users.target.id);
  const after = await userRow(users.target.id);
  assert.notEqual(after.password_hash, targetBefore.password_hash);
  assert.ok(await bcrypt.compare(NEW_PW, after.password_hash));
  assert.ok(!(await bcrypt.compare(OLD_PW, after.password_hash)));
  assert.ok(after.password_changed_at);

  // G/K used token rejected, and cannot reset again to a different password
  assert.equal(await completePasswordReset(raw, 'Another-Passw0rd'), null);
  assert.ok(await bcrypt.compare(NEW_PW, (await userRow(users.target.id)).password_hash));

  // I old password no longer logs in; J new password does (real login route)
  assert.equal((await post('/login', { email: users.target.email, password: OLD_PW })).status, 401);
  const loginNew = await post('/login', { email: users.target.email, password: NEW_PW });
  assert.equal(loginNew.status, 200);
  assert.equal(loginNew.body.user.id, users.target.id);

  // L only password_hash / password_changed_at changed on the target…
  const ignore = new Set(['password_hash', 'password_changed_at']);
  for (const k of Object.keys(targetBefore)) {
    if (!ignore.has(k)) assert.deepEqual(after[k], targetBefore[k], `target.${k} unchanged`);
  }
  // …and the unrelated account + its tokens are identical.
  assert.deepEqual(await userRow(users.bystander.id), bystanderBefore);
  assert.deepEqual(await tokenRows(users.bystander.id), bystanderTokensBefore);
});

test('HTTP: bad token -> 400 with the "request a new link" code; weak password -> 400; success text matches spec', async () => {
  const { sent, send } = capture();
  await query('delete from password_reset_tokens where user_id = $1', [users.target.id]);
  await requestPasswordReset(users.target.email, { send });
  const raw = tokenFromMail(sent[0]);

  const bad = await post('/reset-password', { token: 'f'.repeat(64), password: NEW_PW });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'INVALID_RESET_TOKEN');
  const weak = await post('/reset-password', { token: raw, password: 'short' });
  assert.equal(weak.status, 400);
  const ok = await post('/reset-password', { token: raw, password: 'Third-Passw0rd' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.message, 'Password updated successfully. You can now sign in with your new password.');
  assert.equal((await post('/reset-password', { token: raw, password: 'Fourth-Passw0rd' })).status, 400);
});

test('a newer request supersedes the older link', async () => {
  await query('delete from password_reset_tokens where user_id = $1', [users.bystander.id]);
  const { sent, send } = capture();
  await requestPasswordReset(users.bystander.email, { send });
  const first = tokenFromMail(sent[0]);
  // age the first token's created_at so the cooldown doesn't suppress the 2nd request
  await query(`update password_reset_tokens set created_at = now() - interval '5 minutes' where user_id = $1`, [users.bystander.id]);
  await requestPasswordReset(users.bystander.email, { send });
  const second = tokenFromMail(sent[1]);
  assert.notEqual(first, second);
  assert.equal(await completePasswordReset(first, NEW_PW), null, 'old link no longer works');
  assert.equal(await completePasswordReset(second, NEW_PW), users.bystander.id);
  assert.equal((await tokenRows(users.bystander.id)).filter((r) => !r.used_at).length, 0, 'no live tokens remain after a reset');
});
