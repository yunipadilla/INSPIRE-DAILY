import { Router } from 'express';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { listPendingUsers, approveUser, denyUser, toClientUser, findById } from '../repositories/users.js';
import { sendEmail } from '../services/email.js';
import { env } from '../config/env.js';

const router = Router();

router.use(requireAuth, requireStaff);

router.get('/pending-users', async (req, res) => {
  const users = await listPendingUsers();
  res.json({ users: users.map(toClientUser) });
});

router.post('/users/:id/approve', async (req, res) => {
  const target = await findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const user = await approveUser(req.params.id);
  await sendEmail({
    to: user.email,
    subject: '🎉 Your Inspire Daily account has been approved!',
    html: `<p>Hi ${user.first_name},</p>
           <p>Your Inspire Daily account has been approved. You can now log in and get started.</p>
           <p><a href="${env.clientOrigin}/login">Log in here</a></p>`,
    text: `Hi ${user.first_name}, your Inspire Daily account has been approved. Log in at ${env.clientOrigin}/login`,
  });
  res.json({ user: toClientUser(user) });
});

router.post('/users/:id/deny', async (req, res) => {
  const user = await denyUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: toClientUser(user) });
});

export default router;
