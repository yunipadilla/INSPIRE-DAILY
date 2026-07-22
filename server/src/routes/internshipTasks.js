import { Router } from 'express';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { ptDateString } from '../config/pacificTime.js';
import {
  listVisibleTasks,
  getTask,
  createTask,
  setTaskActive,
  findSignup,
  createSignup,
  getSignup,
  updateSignup,
  listMySignups,
  listAllSignupsForHub,
} from '../repositories/internshipTasks.js';

const router = Router();
router.use(requireAuth);

function requireTaskAccess(req, res, next) {
  if (req.user.app_role === 'alumni') {
    return res.status(403).json({ error: 'Internship Tasks are not available for Alumni.' });
  }
  next();
}
router.use(requireTaskAccess);

function toClientTask(t) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    level: t.level,
    postedByName: t.posted_by_first_name ? `${t.posted_by_first_name} ${t.posted_by_last_name}` : 'Staff',
    active: t.active,
    createdAt: t.created_at,
    mySignup: t.my_signup_id ? { id: t.my_signup_id, status: t.my_signup_status } : null,
  };
}

function toClientSignup(s) {
  return {
    id: s.id,
    taskId: s.task_id,
    title: s.title,
    description: s.description,
    level: s.level,
    status: s.status,
    hoursSpent: s.hours_spent,
    notes: s.notes,
    completedDate: s.completed_date,
    createdAt: s.created_at,
  };
}

router.get('/board', async (req, res) => {
  const tasks = await listVisibleTasks(req.user.app_role, req.user.id);
  res.json({ tasks: tasks.map(toClientTask) });
});

router.get('/my-tasks', async (req, res) => {
  const signups = await listMySignups(req.user.id);
  res.json({ signups: signups.map(toClientSignup) });
});

router.post('/:id/signup', async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task || !task.active) return res.status(404).json({ error: 'Task not found.' });

  const visibleLevels =
    req.user.app_role === 'staff'
      ? ['intern', 'postgrad', 'alumni', 'staff']
      : req.user.app_role === 'postgrad'
        ? ['intern', 'postgrad']
        : ['intern'];
  if (!visibleLevels.includes(task.level)) {
    return res.status(403).json({ error: 'This task is not available at your role level.' });
  }

  const existing = await findSignup(task.id, req.user.id);
  if (existing) return res.status(409).json({ error: 'You have already signed up for this task.' });

  const signup = await createSignup(task.id, req.user.id);
  res.status(201).json({ signup: toClientSignup({ ...signup, title: task.title, description: task.description, level: task.level }) });
});

router.patch('/signups/:id', async (req, res) => {
  const signup = await getSignup(req.params.id, req.user.id);
  if (!signup) return res.status(404).json({ error: 'Signup not found.' });

  const { status, hoursSpent, notes } = req.body || {};
  if (status && !['in_progress', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const updated = await updateSignup(signup.id, {
    status,
    hoursSpent,
    notes,
    completedDate: status === 'completed' ? ptDateString() : null,
  });
  const task = await getTask(updated.task_id);
  res.json({ signup: toClientSignup({ ...updated, title: task.title, description: task.description, level: task.level }) });
});

// --- Staff only ---

router.post('/', requireStaff, async (req, res) => {
  const { title, description, level } = req.body || {};
  if (!title?.trim() || !['intern', 'postgrad', 'alumni', 'staff'].includes(level)) {
    return res.status(400).json({ error: 'A title and valid level are required.' });
  }
  const task = await createTask(req.user.id, { title: title.trim(), description, level });
  res.status(201).json({ task: toClientTask({ ...task, posted_by_first_name: req.user.first_name, posted_by_last_name: req.user.last_name }) });
});

router.patch('/:id/active', requireStaff, async (req, res) => {
  const task = await setTaskActive(req.params.id, Boolean(req.body.active));
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  res.json({ task: toClientTask(task) });
});

router.get('/hub', requireStaff, async (req, res) => {
  const signups = await listAllSignupsForHub();
  res.json({
    signups: signups.map((s) => ({
      id: s.id,
      taskTitle: s.title,
      level: s.level,
      userName: `${s.first_name} ${s.last_name}`,
      appRole: s.app_role,
      status: s.status,
      hoursSpent: s.hours_spent,
      completedDate: s.completed_date,
      createdAt: s.created_at,
    })),
  });
});

export default router;
