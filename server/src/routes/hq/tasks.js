import { Router } from 'express';
import { getTasksOverview, listTasksMembers } from '../../services/hq/tasksService.js';
import { ALL_APP_ROLES } from '../../repositories/users.js';

const router = Router();
const VALID_STATUS = ['in_progress', 'completed'];

router.get('/', async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json(await getTasksOverview({ days }));
});

router.get('/members', async (req, res) => {
  const { search, appRole, status, page, pageSize } = req.query;
  if (appRole && !ALL_APP_ROLES.includes(appRole)) {
    return res.status(400).json({ error: 'Invalid appRole filter.' });
  }
  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: 'Invalid status filter.' });
  }
  res.json(
    await listTasksMembers({
      search: typeof search === 'string' ? search.trim().slice(0, 100) : undefined,
      appRole: typeof appRole === 'string' ? appRole : undefined,
      status: typeof status === 'string' ? status : undefined,
      page,
      pageSize,
    })
  );
});

export default router;
