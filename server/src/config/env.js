import 'dotenv/config';

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'Inspire Daily <no-reply@inspiringchildren.org>',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
    whatsappGroupTo: process.env.TWILIO_WHATSAPP_GROUP_TO || '',
  },
  syncEndpointUrl: process.env.SYNC_ENDPOINT_URL || '',
};

// No insecure default here on purpose: every JWT this server ever issues or
// verifies is only as trustworthy as this secret. Silently falling back to a
// hardcoded string would mean any deployment that forgot to set JWT_SECRET
// (or had it wiped by a config error) would keep running — just signing every
// user's session with a secret anyone can read in this file. Fail loudly at
// startup instead.
if (!env.jwtSecret) {
  throw new Error(
    'JWT_SECRET environment variable is required and was not set. Refusing to start with an ' +
      'insecure default — set JWT_SECRET in server/.env locally (see .env.example), or in your ' +
      "deployment platform's environment variables, before starting the server."
  );
}

export const isEmailConfigured = () => Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
export const isTwilioConfigured = () =>
  Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.whatsappFrom);
