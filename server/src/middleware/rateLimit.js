import rateLimit from 'express-rate-limit';

// Sensible defaults, not maximally strict: real users mistype passwords and
// sometimes double-submit signup forms, so these allow room for that while
// still making credential-stuffing/brute-force and mass-registration scripts
// impractical. Keyed by IP — see app.set('trust proxy', ...) in index.js,
// required for this to see real client IPs (not Render's proxy IP) in prod.

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5, // 5 signups per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts from this device. Please try again later.' },
});
