import { Router } from 'express';
import { getDailyScoresOverview, listDailyScoresMembers } from '../../services/hq/dailyScoresService.js';
import { ALL_APP_ROLES } from '../../repositories/users.js';

const router = Router();

router.get('/', async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const data = await getDailyScoresOverview({ days });
  res.json(data);
});

router.get('/members', async (req, res) => {
  const { search, appRole, page, pageSize } = req.query;
  if (appRole && !ALL_APP_ROLES.includes(appRole)) {
    return res.status(400).json({ error: 'Invalid appRole filter.' });
  }
  const result = await listDailyScoresMembers({
    search: typeof search === 'string' ? search.trim().slice(0, 100) : undefined,
    appRole: typeof appRole === 'string' ? appRole : undefined,
    page,
    pageSize,
  });
  res.json(result);
});

export default router;
