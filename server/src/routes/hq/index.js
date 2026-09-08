import { Router } from 'express';
import { requireAuth, requireHQAccess } from '../../middleware/auth.js';
import overviewRoutes from './overview.js';
import membersRoutes from './members.js';
import badgesRoutes from './badges.js';
import dailyScoresRoutes from './dailyScores.js';
import goalsRoutes from './goals.js';
import challengeRoutes from './challenge.js';
import volunteerHoursRoutes from './volunteerHours.js';
import tasksRoutes from './tasks.js';
import reportsRoutes from './reports.js';
import analyticsRoutes from './analytics.js';
import monthlySnapshotRoutes from './monthlySnapshot.js';

const router = Router();

// Every route under /api/hq requires an authenticated staff/admin/super_admin
// session — enforced here at the API layer, not by hiding navigation on the
// client (see requireHQAccess in middleware/auth.js). Admin-only actions
// (account suspend/activate/delete) apply a second, narrower guard
// (requireHQAdmin) directly on those routes inside members.js.
router.use(requireAuth, requireHQAccess);

router.use('/overview', overviewRoutes);
router.use('/members', membersRoutes);
router.use('/daily-scores', dailyScoresRoutes);
router.use('/goals', goalsRoutes);
router.use('/challenge', challengeRoutes);
router.use('/volunteer-hours', volunteerHoursRoutes);
router.use('/tasks', tasksRoutes);
router.use('/reports', reportsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/monthly-snapshot', monthlySnapshotRoutes);
// Mounted at the /api/hq root (not under /members or /overview): exposes
// GET /api/hq/badge-catalog and POST /api/hq/members/:id/badges.
router.use('/', badgesRoutes);

export default router;
