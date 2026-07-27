import { Router } from 'express';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { activateUser, suspendUser, toClientUser, findById } from '../repositories/users.js';
import { sendEmail } from '../services/email.js';
import { env } from '../config/env.js';

const router = Router();

router.use(requireAuth, requireStaff);

// Account lifecycle management. Signup no longer requires manual review —
// every public signup is active immediately (see server/src/routes/auth.js)
// — so these are the ongoing controls a staff member has over an existing
// account: reactivate it, or suspend it. There is no pending-signup queue
// anymore, so no list/queue route exists here.

async function activate(req, res) {
  const target = await findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const user = await activateUser(req.params.id);
  await sendEmail({
    to: user.email,
    subject: '🎉 Your Inspire Daily account is active!',
    html: `<p>Hi ${user.first_name},</p>
           <p>Your Inspire Daily account is active. You can now log in and get started.</p>
           <p><a href="${env.clientOrigin}/login">Log in here</a></p>`,
    text: `Hi ${user.first_name}, your Inspire Daily account is active. Log in at ${env.clientOrigin}/login`,
  });
  res.json({ user: toClientUser(user) });
}

async function suspend(req, res) {
  const user = await suspendUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: toClientUser(user) });
}

router.post('/users/:id/activate', activate);
router.post('/users/:id/suspend', suspend);

/**
 * Deprecated: kept temporarily for compatibility with the approval-era
 * names. Routed through the exact same handlers above — no duplicated
 * logic. Confirmed (grepped client/src) that no frontend code calls these;
 * safe to delete once nothing external calls them either.
 */
function deprecatedAlias(handler, successorPath) {
  return (req, res, next) => {
    res.set('Deprecation', 'true');
    res.set('Link', `<${successorPath}>; rel="successor-version"`);
    console.warn(`[admin] deprecated route ${req.method} ${req.originalUrl} called — use ${successorPath} instead`);
    return handler(req, res, next);
  };
}

router.post('/users/:id/approve', deprecatedAlias(activate, '/api/admin/users/:id/activate'));
router.post('/users/:id/deny', deprecatedAlias(suspend, '/api/admin/users/:id/suspend'));

export default router;
