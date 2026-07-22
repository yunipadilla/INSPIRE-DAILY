import { verifyToken } from '../lib/jwt.js';
import { findById } from '../repositories/users.js';

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
    if (user.account_status !== 'approved') {
      return res.status(403).json({
        error:
          user.account_status === 'pending'
            ? 'Your account is pending approval — please wait for an administrator to grant you access.'
            : 'Your account is not active. Please contact an administrator.',
        accountStatus: user.account_status,
      });
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
