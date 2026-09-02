import { Router } from 'express';
import { getAnalytics, getRoleComparison } from '../../services/hq/analyticsService.js';

const router = Router();

router.get('/', async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json(await getAnalytics({ days }));
});

router.get('/roles', async (req, res) => {
  res.json({ roles: await getRoleComparison() });
});

export default router;
