import { Router } from 'express';
import { getChallengeOverview, getChallengeLeaderboard, listChallengeMembers } from '../../services/hq/challengeService.js';
import { ALL_APP_ROLES } from '../../repositories/users.js';

const router = Router();
const MONTH_RE = /^\d{4}-\d{2}$/;

function validMonth(m) {
  return typeof m === 'string' && MONTH_RE.test(m) ? m : undefined;
}

router.get('/', async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json(await getChallengeOverview({ days, month: validMonth(req.query.month) }));
});

router.get('/leaderboard', async (req, res) => {
  res.json({ entries: await getChallengeLeaderboard({ month: validMonth(req.query.month) }) });
});

router.get('/members', async (req, res) => {
  const { search, appRole, page, pageSize } = req.query;
  if (appRole && !ALL_APP_ROLES.includes(appRole)) {
    return res.status(400).json({ error: 'Invalid appRole filter.' });
  }
  res.json(
    await listChallengeMembers({
      search: typeof search === 'string' ? search.trim().slice(0, 100) : undefined,
      appRole: typeof appRole === 'string' ? appRole : undefined,
      page,
      pageSize,
    })
  );
});

export default router;
