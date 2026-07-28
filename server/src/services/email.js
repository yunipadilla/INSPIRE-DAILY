import nodemailer from 'nodemailer';
import { env, isEmailConfigured } from '../config/env.js';

let transporter = null;
function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

/**
 * Sends an email if SMTP credentials are configured; otherwise logs what
 * would have been sent. This lets every real email-triggering flow (account
 * approval, parental consent, encouragement, monthly reports) be written
 * once, now, without needing a live email account to develop against.
 *
 * Pass `sensitive: true` for anything whose body carries a credential-like
 * secret (a password-reset link, say) — the stub then logs only that an
 * email would have been sent, never the body, so the raw secret is never
 * written to any log, in any environment, regardless of whether SMTP is
 * configured.
 */
export async function sendEmail({ to, subject, html, text, sensitive = false }) {
  const t = getTransporter();
  if (!t) {
    if (sensitive) {
      console.log(`[email:stub] to=${to} subject="${subject}" — body withheld (sensitive); configure SMTP to actually deliver it`);
    } else {
      console.log(`[email:stub] to=${to} subject="${subject}"\n${text || html}`);
    }
    return { sent: false, stubbed: true };
  }
  await t.sendMail({ from: env.smtp.from, to, subject, html, text });
  return { sent: true, stubbed: false };
}
