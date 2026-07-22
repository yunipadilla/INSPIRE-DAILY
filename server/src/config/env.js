import 'dotenv/config';

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  return value;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
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

export const isEmailConfigured = () => Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);
export const isTwilioConfigured = () =>
  Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.whatsappFrom);
