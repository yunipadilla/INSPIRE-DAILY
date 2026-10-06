// Pure unit tests for password-reset building blocks (no database, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'unit-test-secret';
const { generateResetToken, hashResetToken, resetTokenExpiresAt, PASSWORD_RESET_TOKEN_TTL_MINUTES } =
  await import('../src/lib/passwordReset.js');
const { appBaseUrl, passwordResetUrl, PRODUCTION_APP_URL } = await import('../src/lib/appUrl.js');
const { buildResetEmail } = await import('../src/services/passwordResetService.js');

test('reset tokens are 256-bit random, unique, and only their hash is derivable', () => {
  const a = generateResetToken();
  const b = generateResetToken();
  assert.match(a.raw, /^[0-9a-f]{64}$/);
  assert.notEqual(a.raw, b.raw);
  assert.equal(a.hash, hashResetToken(a.raw));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(a.hash, a.raw);
});

test('reset tokens expire in 60 minutes', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  assert.equal(PASSWORD_RESET_TOKEN_TTL_MINUTES, 60);
  assert.equal(resetTokenExpiresAt(now).toISOString(), '2026-10-06T13:00:00.000Z');
});

test('reset links use the configured https origin in production', () => {
  const o = { nodeEnv: 'production', appUrl: '', clientOrigin: 'https://inspire-daily.onrender.com/' };
  assert.equal(appBaseUrl(o), 'https://inspire-daily.onrender.com');
  assert.equal(passwordResetUrl('abc123', o), 'https://inspire-daily.onrender.com/reset-password?token=abc123');
});

test('in production a localhost / http / missing origin can never reach an email link', () => {
  for (const clientOrigin of ['http://localhost:5173', 'http://127.0.0.1:4000', 'http://inspire-daily.onrender.com', '']) {
    assert.equal(appBaseUrl({ nodeEnv: 'production', appUrl: '', clientOrigin }), PRODUCTION_APP_URL, clientOrigin);
  }
  assert.equal(appBaseUrl({ nodeEnv: 'development', appUrl: '', clientOrigin: 'http://localhost:5173' }), 'http://localhost:5173');
  // APP_URL wins over CLIENT_ORIGIN when valid
  assert.equal(appBaseUrl({ nodeEnv: 'production', appUrl: 'https://daily.example.org', clientOrigin: 'http://localhost:5173' }), 'https://daily.example.org');
});

test('reset email has a Reset Password button, the link, the expiry, and escapes the name', () => {
  const url = 'https://inspire-daily.onrender.com/reset-password?token=abc';
  const m = buildResetEmail({ firstName: '<b>Zoe</b>', resetUrl: url });
  assert.equal(m.subject, 'Reset your Inspire Daily password');
  assert.ok(m.html.includes(`href="${url}"`));
  assert.ok(m.html.includes('>Reset Password<'));
  assert.ok(m.html.includes('60 minutes'));
  assert.ok(!m.html.includes('<b>Zoe</b>'), 'name is HTML-escaped');
  assert.ok(m.text.includes(url));
});
