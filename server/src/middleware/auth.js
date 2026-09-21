import { verifyToken } from '../lib/jwt.js';
import { findById } from '../repositories/users.js';
import { isActive, isPending } from '../config/accountStatus.js';
import { ptDateString } from '../config/pacificTime.js';
import { getCheckpointForUser } from '../repositories/base44Checkpoints.js';
import { reconcileOneUser } from '../agents/dailyScoresAgent.js';

function extractToken(req) {
  if (req.cookies?.token) return req.cookies.token;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated.' });
    const payload = verifyToken(token);
    const user = await findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });

    // Session invalidation for a stateless JWT: rather than maintaining a
    // token blacklist, every token carries an `iat` (issued-at) claim. If
    // the account's password has been changed more recently than this token
    // was issued, the token predates the reset and is treated as no longer
    // valid — this is what makes "existing sessions are invalidated" true
    // for a password reset, on every device, without extra storage.
    if (user.password_changed_at) {
      const changedAtMs = new Date(user.password_changed_at).getTime();
      const tokenIssuedMs = payload.iat * 1000;
      if (tokenIssuedMs < changedAtMs) {
        return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
      }
    }

    if (!isActive(user.account_status)) {
      return res.status(403).json({
        error: isPending(user.account_status)
          ? 'Your account is pending approval — please wait for an administrator to grant you access.'
          : 'Your account is not active. Please contact an administrator.',
        accountStatus: user.account_status,
      });
    }
    // Opportunistic streak/shield reconciliation. This app runs on Render's
    // free tier, which suspends the process when idle — an in-process cron
    // (dailyScoresAgent's noon-PT schedule) simply isn't running most of the
    // time, so it cannot be trusted alone to catch a missed required day the
    // moment it happens (confirmed as the root cause of a 2026-09-16
    // incident where a shield had genuinely protected a streak but the
    // decrement sat uncommitted for hours). Piggybacking on real
    // authenticated traffic — which the free tier does serve — makes this
    // self-healing: at most once per PT calendar day per user (guarded by
    // last_streak_reconcile_date, so this never re-runs on every request),
    // cheap (two lookups), and never allowed to fail or slow down the
    // request it rides in on.
    const today = ptDateString();
    if (user.last_streak_reconcile_date !== today) {
      try {
        const checkpointRow = await getCheckpointForUser(user.id);
        const checkpoint = checkpointRow
          ? { checkpointDate: checkpointRow.checkpoint_date, streakCheckpoint: checkpointRow.streak_checkpoint }
          : null;
        // reconcileOneUser already persisted whichever of these fields
        // changed — mirror the same outcome onto this in-memory user so the
        // CURRENT request (e.g. Home) reflects it immediately too, without
        // re-deriving per-action-type logic that could drift from what was
        // actually written.
        const outcome = await reconcileOneUser(user, new Date(), checkpoint);
        if ('streakCount' in outcome) user.streak_count = outcome.streakCount;
        if ('streakShields' in outcome) user.streak_shields = outcome.streakShields;
        if ('streakLastDate' in outcome) user.streak_last_date = outcome.streakLastDate;
        if ('shieldProgressAnchor' in outcome) user.shield_progress_anchor = outcome.shieldProgressAnchor;
        if ('recoveryAvailableUntil' in outcome) user.streak_recovery_available_until = outcome.recoveryAvailableUntil;
        if ('recoveryPriorCount' in outcome) user.streak_recovery_prior_count = outcome.recoveryPriorCount;
        user.last_streak_reconcile_date = today;
      } catch (err) {
        // Never let a reconciliation hiccup break authentication — the real
        // noon-PT cron and the next request both get another chance.
        console.error('[requireAuth] opportunistic streak reconciliation failed (non-fatal):', err.message);
      }
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.app_role)) {
      return res.status(403).json({ error: 'You do not have access to this resource.' });
    }
    next();
  };
}

export const requireStaff = requireRole('staff');

/** Postgrad access includes intern-level content; everyone else is exact-match. */
export function requireAtLeastRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.app_role;
    const allowed = new Set(roles);
    if (role === 'postgrad') allowed.add('intern').add('postgrad');
    if (role === 'staff') return next(); // staff can see everything
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'You do not have access to this resource.' });
    }
    next();
  };
}

/**
 * Gates on `system_role` — the Inspire HQ authorization dimension, distinct
 * from `app_role` (which governs participant-tier content in Inspire Daily
 * and is left untouched here). Every public signup defaults to
 * system_role='participant' and can never self-elevate (see
 * PUBLIC_SIGNUP_APP_ROLES / users.js) — admin/super_admin are only ever
 * granted by a deliberate, manual database action.
 */
export function requireSystemRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!roles.includes(req.user.system_role)) {
      return res.status(403).json({ error: 'You do not have access to this resource.' });
    }
    next();
  };
}

/**
 * Inspire HQ's route guard: staff, admin, and super_admin may enter.
 * Participants are rejected here at the API layer regardless of whether the
 * frontend also hides HQ navigation from them — the real boundary is this
 * check, never hidden UI. Cohort-level scoping (a staff member seeing only
 * their assigned cohort) is intentionally not implemented yet — it depends
 * on the still-unapplied cohorts/staff_cohort_assignments migration, out of
 * scope for this build phase. For now every staff/admin/super_admin account
 * sees every member.
 */
export const requireHQAccess = requireSystemRole('staff', 'admin', 'super_admin');

/**
 * Admin-tier HQ actions: cohort/staff-assignment management (not yet built),
 * account suspension/reactivation, permanent account deletion, program
 * settings. Ordinary staff get HQ dashboard/analytics/badge-award access via
 * requireHQAccess above, but never these — see INSPIRE_MASTER_CONTEXT.md's
 * HQ 2.0 access model.
 */
export const requireHQAdmin = requireSystemRole('admin', 'super_admin');
