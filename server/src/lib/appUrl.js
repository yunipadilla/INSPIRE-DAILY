import { env } from '../config/env.js';

// The one public address of the production app. Only used as a safety net
// when CLIENT_ORIGIN/APP_URL is missing or points somewhere a participant's
// email link must never go (localhost, plain http) while running in
// production — a reset link that opens http://localhost:5173 is a dead link.
export const PRODUCTION_APP_URL = 'https://inspire-daily.onrender.com';

const LOCAL_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i;

/** Base URL (no trailing slash) for links that leave the app, e.g. emails. */
export function appBaseUrl({ nodeEnv = process.env.NODE_ENV, appUrl = env.appUrl, clientOrigin = env.clientOrigin } = {}) {
  const configured = String(appUrl || clientOrigin || '').trim().replace(/\/+$/, '');
  if (nodeEnv === 'production' && (!configured || LOCAL_HOST_RE.test(configured) || !configured.startsWith('https://'))) {
    return PRODUCTION_APP_URL;
  }
  return configured || 'http://localhost:5173';
}

export function passwordResetUrl(rawToken, opts) {
  return `${appBaseUrl(opts)}/reset-password?token=${encodeURIComponent(rawToken)}`;
}
