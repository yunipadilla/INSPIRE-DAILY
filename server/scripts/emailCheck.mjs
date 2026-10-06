// Sends ONE plain test email through whatever provider the current
// environment is configured for, and reports what the provider said. Prints
// no secrets. Run it after setting RESEND_API_KEY / EMAIL_FROM in server/.env:
//
//   node scripts/emailCheck.mjs you@example.com
import { emailProvider } from '../src/config/env.js';
import { sendEmail } from '../src/services/email.js';

const to = process.argv[2];
if (!to) {
  console.error('usage: node scripts/emailCheck.mjs <recipient-email>');
  process.exit(1);
}
console.log(`provider: ${emailProvider()}`);
try {
  const r = await sendEmail({
    to,
    subject: 'Inspire Daily email check',
    text: 'If you can read this, Inspire Daily can send email.',
    html: '<p>If you can read this, Inspire Daily can send email.</p>',
  });
  console.log(r.sent ? `ACCEPTED by ${r.provider}${r.id ? ` (id ${r.id})` : ''}` : 'NOT SENT (no provider configured — stub only)');
  process.exit(r.sent ? 0 : 2);
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
}
