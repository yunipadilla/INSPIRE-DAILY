import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../lib/validators.js';
import { ageInYears, randomToken } from '../lib/crypto.js';
import { ptDateString } from '../config/pacificTime.js';
import { signToken } from '../lib/jwt.js';
import { sendEmail } from '../services/email.js';
import { env } from '../config/env.js';
import { withTransaction } from '../db.js';
import {
  findByEmail,
  createUser,
  toClientUser,
  confirmParentalConsentByToken,
  updatePasswordHash,
} from '../repositories/users.js';
import { createResetToken, claimResetToken } from '../repositories/passwordResetTokens.js';
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiresAt,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
} from '../lib/passwordReset.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, signupLimiter, passwordResetLimiter } from '../middleware/rateLimit.js';
import { ACCOUNT_STATUS, isPending, isBlocked } from '../config/accountStatus.js';

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

  let parentalConsentToken = null;
  let parentalConsentTokenExpires = null;
  if (isMinor) {
    parentalConsentToken = randomToken();
    parentalConsentTokenExpires = new Date(
      Date.now() + PARENTAL_CONSENT_TOKEN_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();
  }

  // Immediate self-service activation: every public signup is approved on
  // the spot and can log in right away — the manual staff-review queue is
  // gone. The one exception is a still-disabled-by-default legal gate, not
  // an administrative one: if PARENTAL_CONSENT_ENABLED is ever flipped back
  // on, an under-16 signup must stay pending until a parent/guardian
  // actually confirms, regardless of this product change.
  const accountStatus = isMinor ? ACCOUNT_STATUS.PENDING : ACCOUNT_STATUS.APPROVED;

  const user = await createUser({
    email: data.email,
    passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    birthday: data.birthday,
    phone: data.phone || null,
    profilePhotoUrl: data.profilePhotoUrl || null,
    appRole: data.appRole,
    accountStatus,
    quoteOfDay: Boolean(data.quoteOfDay),
    parentalConsentRequired: isMinor,
    parentalConsentEmail: isMinor ? data.parentGuardianEmail : null,
    parentalConsentStatus: isMinor ? 'pending' : 'not_required',
    parentalConsentToken,
    parentalConsentTokenExpires,
    approvedAt: accountStatus === ACCOUNT_STATUS.APPROVED ? new Date().toISOString() : null,
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

  if (accountStatus !== ACCOUNT_STATUS.APPROVED) {
    // Only reachable if parental consent is required — no session exists
    // yet because the account genuinely isn't allowed in until a parent or
    // guardian confirms via the emailed link.
    return res.status(201).json({
      message: 'Your account is almost ready — we\'ve emailed a parental consent request, and you can log in once it\'s confirmed.',
      user: toClientUser(user),
      requiresParentalConsent: true,
    });
  }

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTIONS);
  return res.status(201).json({
    message: 'Welcome to Inspire Daily! Your account is ready.',
    token,
    user: toClientUser(user),
    requiresParentalConsent: false,
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

  if (isPending(user.account_status)) {
    return res.status(403).json({
      error: 'Your account is pending approval — please wait for an administrator to grant you access.',
      accountStatus: user.account_status,
    });
  }
  if (isBlocked(user.account_status)) {
    return res.status(403).json({
      error: 'Your account is not active. Please contact an administrator.',
      accountStatus: user.account_status,
    });
  }

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTIONS);
  return res.json({ token, user: toClientUser(user) });
});

router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);

  // The response is identical whether the input was malformed, the email
  // doesn't exist, or a real reset email was just sent — an attacker must
  // not be able to use this endpoint to discover which emails have
  // accounts. Only a successfully-parsed, existing email actually does
  // anything; everything else silently falls through to the same message.
  if (parsed.success) {
    const user = await findByEmail(parsed.data.email);
    // Deliberately independent of account_status: a suspended/denied
    // account can still request and complete a password reset — it simply
    // still can't log in afterward, since that's a separate check in
    // requireAuth/login. This keeps reset behavior identical regardless of
    // status, so status can never leak through this endpoint either.
    if (user) {
      const { raw, hash } = generateResetToken();
      await createResetToken(user.id, hash, resetTokenExpiresAt());
      const resetLink = `${env.clientOrigin}/reset-password?token=${raw}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your Inspire Daily password',
        html: `<p>Hi ${user.first_name},</p>
               <p>Click the link below to choose a new password. This link expires in ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes and can only be used once.</p>
               <p><a href="${resetLink}">Reset your password</a></p>
               <p>If you didn't request this, you can safely ignore this email — your password hasn't changed.</p>`,
        text: `Reset your Inspire Daily password: ${resetLink}\n\nThis link expires in ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes and can only be used once. If you didn't request this, ignore this email.`,
        sensitive: true,
      });
    }
  }

  return res.json({
    message: "If an account exists for that email, we've sent a link to reset your password.",
  });
});

router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request.' });
  }

  // Hash before opening the transaction — bcrypt is deliberately slow, and
  // there's no reason to hold a DB connection/transaction open for it.
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // Claiming the token and updating the password happen in one transaction:
  // if the password update fails for any reason, the token's used_at is
  // rolled back with it — a token must never be burned without the
  // password having actually changed. A token that's missing, expired, or
  // already used all fail identically, with no distinguishing information
  // returned.
  const userId = await withTransaction(async (client) => {
    const claimedUserId = await claimResetToken(client, hashResetToken(parsed.data.token));
    if (!claimedUserId) return null;
    // Only ever touches password_hash/password_changed_at — a reset can
    // never change app_role, system_role, or account_status, so it cannot
    // be used to elevate privileges.
    await updatePasswordHash(client, claimedUserId, passwordHash);
    return claimedUserId;
  });

  if (!userId) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  // No auto-login: this only proves control of the email inbox, not that
  // this is a trusted device. Sending the user to log in fresh (with their
  // new password) is the safer, conventional pattern.
  return res.json({ message: 'Your password has been reset. You can now log in.' });
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
