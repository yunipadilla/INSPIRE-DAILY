import nodemailer from 'nodemailer';
import { env, emailProvider } from '../config/env.js';

const SEND_TIMEOUT_MS = 10_000;

let transporter = null;
function getSmtpTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
      // Without these, a blocked/filtered SMTP port (Render's free plan blocks
      // 25/465/587) leaves the request hanging for minutes instead of failing.
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }
  return transporter;
}

async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.smtp.from, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Provider's error text only (e.g. "domain is not verified") — never the
    // key, never the email body.
    throw new Error(`Resend rejected the email (HTTP ${res.status}): ${body?.message || body?.name || 'unknown error'}`);
  }
  return { sent: true, stubbed: false, provider: 'resend', id: body.id };
}

/**
 * Sends an email via the first configured provider:
 *   1. Resend's HTTPS API (RESEND_API_KEY) — preferred; port 443 works on
 *      every Render plan.
 *   2. SMTP (SMTP_HOST/USER/PASS) — fallback. NOTE: Render's free plan
 *      blocks outbound ports 25, 465 and 587.
 *   3. Stub — logs that an email would have been sent. Nothing is delivered.
 *
 * Returns { sent, stubbed, provider }. THROWS if a configured provider
 * fails, so callers can log it — callers that must not leak account
 * existence (forgot-password) catch it themselves.
 *
 * Pass `sensitive: true` for anything whose body carries a credential-like
 * secret (a password-reset link): the body is then never logged, in any
 * environment, whatever the provider.
 */
export async function sendEmail({ to, subject, html, text, sensitive = false }) {
  const provider = emailProvider();
  if (provider === 'resend') return sendViaResend({ to, subject, html, text });
  if (provider === 'smtp') {
    await getSmtpTransporter().sendMail({ from: env.smtp.from, to, subject, html, text });
    return { sent: true, stubbed: false, provider: 'smtp' };
  }
  if (sensitive) {
    console.log(`[email:stub] subject="${subject}" — NOT DELIVERED, body withheld (sensitive); configure an email provider`);
  } else {
    console.log(`[email:stub] to=${to} subject="${subject}" — NOT DELIVERED\n${text || html}`);
  }
  return { sent: false, stubbed: true, provider: 'stub' };
}
