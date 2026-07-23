import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signupSchema, loginSchema } from '../lib/validators.js';
import { ageInYears, randomToken } from '../lib/crypto.js';
import { ptDateString } from '../config/pacificTime.js';
import { signToken } from '../lib/jwt.js';
import { sendEmail } from '../services/email.js';
import { env } from '../config/env.js';
import {
  findByEmail,
  createUser,
  toClientUser,
  confirmParentalConsentByToken,
} from '../repositories/users.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, signupLimiter } from '../middleware/rateLimit.js';

const router = Router();
const PARENTAL_CONSENT_TOKEN_TTL_HOURS = 72;
const UNDER_AGE_THRESHOLD = 16;
// Parental consent is disabled for now per program decision — flip this back
// to true to re-enable the under-16 gate without any other code changes.
const PARENTAL_CONSENT_ENABLED = false;

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

router.post('/signup', signupLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid signup data.' });
  }
  const data = parsed.data;

  const existing = await findByEmail(data.email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const age = ageInYears(data.birthday, ptDateString());
  const isMinor = PARENTAL_CONSENT_ENABLED && age < UNDER_AGE_THRESHOLD;

  if (isMinor && !data.parentGuardianEmail) {
    return res.status(400).json({
      error: 'A parent or guardian email is required for members under 16.',
      requiresParentalConsent: true,
    });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const isStaff = data.appRole === 'staff';

  let parentalConsentToken = null;
  let parentalConsentTokenExpires = null;
  if (isMinor) {
    parentalConsentToken = randomToken();
    parentalConsentTokenExpires = new Date(
      Date.now() + PARENTAL_CONSENT_TOKEN_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();
  }

  const user = await createUser({
    email: data.email,
    passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    birthday: data.birthday,
    phone: data.phone || null,
    profilePhotoUrl: data.profilePhotoUrl || null,
    appRole: data.appRole,
    accountStatus: isStaff ? 'approved' : 'pending',
    quoteOfDay: Boolean(data.quoteOfDay),
    parentalConsentRequired: isMinor,
    parentalConsentEmail: isMinor ? data.parentGuardianEmail : null,
    parentalConsentStatus: isMinor ? 'pending' : 'not_required',
    parentalConsentToken,
    parentalConsentTokenExpires,
    approvedAt: isStaff ? new Date().toISOString() : null,
  });

  if (isMinor) {
    const consentLink = `${env.clientOrigin}/parental-consent?token=${parentalConsentToken}`;
    await sendEmail({
      to: data.parentGuardianEmail,
      subject: `Parental consent needed for ${data.firstName} ${data.lastName} — Inspire Daily`,
      html: `<p>${data.firstName} ${data.lastName} has signed up for Inspire Daily, a personal development app run by the Inspiring Children Foundation.</p>
             <p>Because they are under 16, we need a parent or guardian's consent before their account can be approved.</p>
             <p><a href="${consentLink}">Click here to give consent</a> (link expires in ${PARENTAL_CONSENT_TOKEN_TTL_HOURS} hours).</p>`,
      text: `${data.firstName} ${data.lastName} has signed up for Inspire Daily and needs parental consent. Confirm here: ${consentLink}`,
    });
  }

  return res.status(201).json({
    message: isStaff
      ? 'Your Staff account is ready — you can log in now.'
      : 'Your account is pending approval — an administrator will review and approve your account shortly.',
    user: toClientUser(user),
    requiresParentalConsent: isMinor,
  });
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const { email, password } = parsed.data;

  const user = await findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.account_status === 'pending') {
    return res.status(403).json({
      error: 'Your account is pending approval — please wait for an administrator to grant you access.',
      accountStatus: 'pending',
    });
  }
  if (user.account_status === 'denied') {
    return res.status(403).json({
      error: 'Your account request was not approved. Please contact an administrator.',
      accountStatus: 'denied',
    });
  }

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTIONS);
  return res.json({ token, user: toClientUser(user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { ...COOKIE_OPTIONS, maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: toClientUser(req.user) });
});

router.post('/parental-consent/confirm', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing consent token.' });
  const user = await confirmParentalConsentByToken(token);
  if (!user) {
    return res.status(400).json({ error: 'This consent link is invalid or has expired.' });
  }
  res.json({ ok: true, message: 'Thank you — parental consent has been recorded.' });
});

export default router;
