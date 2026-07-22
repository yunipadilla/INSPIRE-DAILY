import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ptDateString, currentMonthBoundsPT, ptDayOfWeek, addDays } from '../config/pacificTime.js';
import { isGoalComplete } from '../lib/goalCompletion.js';
import {
  listGoalsForUser,
  getGoal,
  createGoal,
  updateGoalDetails,
  touchGoal,
  markGoalCompleted,
  deleteGoal,
  createBook,
  listBooksForGoal,
  getBook,
  updateBookProgress,
  markBookCompleted,
  createLog,
  listLogsForGoal,
  findLogByDate,
} from '../repositories/goals.js';

const router = Router();
router.use(requireAuth);

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function hydrateGoal(goal) {
  const [books, logs] = await Promise.all([
    goal.type === 'reading' ? listBooksForGoal(goal.id) : Promise.resolve([]),
    listLogsForGoal(goal.id),
  ]);
  return { ...goal, books, logs };
}

async function reCheckCompletion(goalId, userId) {
  const goal = await getGoal(goalId, userId);
  if (!goal || goal.completed) return { goal, justCompleted: false };
  const [books, logs] = await Promise.all([
    goal.type === 'reading' ? listBooksForGoal(goal.id) : Promise.resolve([]),
    listLogsForGoal(goal.id),
  ]);
  if (isGoalComplete(goal, { books, logs })) {
    const updated = await markGoalCompleted(goal.id, ptDateString());
    return { goal: updated, justCompleted: true };
  }
  return { goal, justCompleted: false };
}

function toClientGoal(g) {
  return {
    id: g.id,
    type: g.type,
    name: g.name,
    targetDate: g.target_date,
    completed: g.completed,
    completedDate: g.completed_date,
    details: g.details,
    updatedAt: g.updated_at,
    createdAt: g.created_at,
    books: (g.books || []).map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      totalPages: b.total_pages,
      currentPage: b.current_page,
      completed: b.completed,
      completedDate: b.completed_date,
      startDate: b.start_date,
      progressPct: b.total_pages > 0 ? Math.min(100, Math.round((b.current_page / b.total_pages) * 100)) : 0,
    })),
    logs: (g.logs || []).map((l) => ({
      id: l.id,
      bookId: l.book_id,
      date: l.date,
      logType: l.log_type,
      note: l.note,
      value: l.value,
      activity: l.activity,
      weekKey: l.week_key,
    })),
  };
}

router.get('/', async (req, res) => {
  const goals = await listGoalsForUser(req.user.id);
  const hydrated = await Promise.all(goals.map(hydrateGoal));

  const { start, end } = currentMonthBoundsPT();
  const active = hydrated.filter((g) => !g.completed);
  const completed = hydrated.filter((g) => g.completed);
  const completedThisMonth = completed.filter(
    (g) => g.completed_date && g.completed_date >= start && g.completed_date <= end
  );
  const mostRecent = hydrated[0] || null;

  res.json({
    overview: {
      activeCount: active.length,
      completedThisMonthCount: completedThisMonth.length,
      mostRecentlyUpdated: mostRecent ? { id: mostRecent.id, name: mostRecent.name, type: mostRecent.type } : null,
    },
    active: active.map(toClientGoal),
    completed: completed.map(toClientGoal),
  });
});

router.post('/', async (req, res) => {
  const { type, name, targetDate, details, books } = req.body || {};
  const VALID_TYPES = ['reading', 'fitness_daily', 'fitness_weekly', 'learning', 'meditation', 'custom'];
  if (!VALID_TYPES.includes(type) || !name?.trim()) {
    return res.status(400).json({ error: 'A goal type and name are required.' });
  }

  const goal = await createGoal(req.user.id, { type, name: name.trim(), targetDate, details: details || {} });

  if (type === 'reading' && Array.isArray(books)) {
    await Promise.all(
      books.map((b, i) =>
        createBook(goal.id, req.user.id, {
          title: b.title,
          author: b.author,
          totalPages: Number(b.totalPages) || 0,
          startDate: b.startDate,
          orderIndex: i,
        })
      )
    );
  }

  const hydrated = await hydrateGoal(await getGoal(goal.id, req.user.id));
  res.status(201).json({ goal: toClientGoal(hydrated) });
});

router.delete('/:id', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });
  await deleteGoal(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/:id/complete', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });
  const updated = await markGoalCompleted(goal.id, ptDateString());
  res.json({ goal: toClientGoal(await hydrateGoal(updated)) });
});

// --- Reading: book progress ---

router.patch('/:id/books/:bookId', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal || goal.type !== 'reading') return res.status(404).json({ error: 'Reading goal not found.' });
  const book = await getBook(req.params.bookId, req.user.id);
  if (!book || book.goal_id !== goal.id) return res.status(404).json({ error: 'Book not found.' });

  const currentPage = Math.max(0, Math.min(book.total_pages, Number(req.body.currentPage) || 0));
  let updatedBook = await updateBookProgress(book.id, currentPage);
  let bookJustCompleted = false;
  if (!updatedBook.completed && currentPage >= book.total_pages && book.total_pages > 0) {
    updatedBook = await markBookCompleted(book.id, ptDateString());
    bookJustCompleted = true;
  }

  await touchGoal(goal.id);
  const { goal: refreshedGoal, justCompleted: goalJustCompleted } = await reCheckCompletion(goal.id, req.user.id);
  const hydrated = await hydrateGoal(refreshedGoal);

  res.json({ goal: toClientGoal(hydrated), bookJustCompleted, goalJustCompleted });
});

// --- Fitness Daily: log a day ---

router.post('/:id/log-day', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal || (goal.type !== 'fitness_daily' && goal.type !== 'fitness_weekly')) {
    return res.status(404).json({ error: 'Fitness goal not found.' });
  }
  const { date, type, activity } = req.body || {};
  if (!date || !['completed', 'rest'].includes(type)) {
    return res.status(400).json({ error: 'date and type (completed|rest) are required.' });
  }

  const existing = await findLogByDate(goal.id, date);
  if (existing) return res.status(409).json({ error: 'Already logged for this date.' });

  if (type === 'rest' && goal.type === 'fitness_daily') {
    const allowedPerWeek = goal.details.restDaysPerWeek || 0;
    const weekStart = addDays(date, -6);
    const logs = await listLogsForGoal(goal.id);
    const restsThisWeek = logs.filter((l) => l.log_type === 'rest' && l.date >= weekStart && l.date <= date).length;
    if (restsThisWeek >= allowedPerWeek) {
      return res.status(400).json({ error: 'No rest days remaining this week for this goal.' });
    }
  }

  await createLog(goal.id, req.user.id, {
    date,
    logType: type,
    activity: activity || goal.details.activity || null,
  });
  await touchGoal(goal.id);
  const { goal: refreshedGoal, justCompleted } = await reCheckCompletion(goal.id, req.user.id);
  const hydrated = await hydrateGoal(refreshedGoal);
  res.json({ goal: toClientGoal(hydrated), goalJustCompleted: justCompleted });
});

router.get('/:id/calendar', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found.' });
  const logs = await listLogsForGoal(goal.id);
  const startDate = goal.details.startDate || goal.created_at?.toISOString?.().split('T')[0] || ptDateString();
  const todayStr = ptDateString();

  const days = [];
  let cursor = startDate;
  while (cursor <= todayStr && days.length < 400) {
    const log = logs.find((l) => l.date === cursor);
    days.push({
      date: cursor,
      status: log ? log.log_type : cursor === todayStr ? 'today' : 'missed',
    });
    cursor = addDays(cursor, 1);
  }
  res.json({ days });
});

// --- Fitness Weekly: today's scheduled activity + week recap ---

router.get('/:id/week-recap', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal || goal.type !== 'fitness_weekly') return res.status(404).json({ error: 'Goal not found.' });
  const schedule = goal.details.schedule || {};
  const activeDays = Object.entries(schedule).filter(([, v]) => v).map(([day]) => day);

  const todayStr = ptDateString();
  const dow = ptDayOfWeek(todayStr);
  const weekStart = addDays(todayStr, -dow); // Sunday of this week

  const logs = await listLogsForGoal(goal.id);
  const thisWeekLogs = logs.filter((l) => l.date >= weekStart && l.date <= todayStr);
  const completedDays = thisWeekLogs.filter((l) => l.log_type === 'completed').length;

  res.json({
    todaysActivity: schedule[WEEKDAY_NAMES[dow]] || null,
    activeDaysCount: activeDays.length,
    completedThisWeek: completedDays,
    isPerfectWeek: activeDays.length > 0 && completedDays >= activeDays.length,
  });
});

// --- Learning: log a session ---

router.post('/:id/log-session', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal || goal.type !== 'learning') return res.status(404).json({ error: 'Learning goal not found.' });
  const minutes = Number(req.body.minutes);
  if (!minutes || minutes <= 0) return res.status(400).json({ error: 'minutes must be a positive number.' });

  await createLog(goal.id, req.user.id, {
    date: ptDateString(),
    logType: 'session',
    value: minutes,
    note: req.body.note || null,
  });
  await touchGoal(goal.id);
  const { goal: refreshedGoal, justCompleted } = await reCheckCompletion(goal.id, req.user.id);
  const hydrated = await hydrateGoal(refreshedGoal);
  res.json({ goal: toClientGoal(hydrated), goalJustCompleted: justCompleted });
});

// --- Meditation: log today ---

router.post('/:id/log-today', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal || goal.type !== 'meditation') return res.status(404).json({ error: 'Meditation goal not found.' });
  const today = ptDateString();
  const existing = await findLogByDate(goal.id, today);
  if (existing) return res.status(409).json({ error: 'Already logged today.' });

  const minutes = Number(req.body.minutes) || goal.details.dailyTargetMinutes || 0;
  await createLog(goal.id, req.user.id, { date: today, logType: 'completed', value: minutes });
  await touchGoal(goal.id);
  const { goal: refreshedGoal, justCompleted } = await reCheckCompletion(goal.id, req.user.id);
  const hydrated = await hydrateGoal(refreshedGoal);
  res.json({ goal: toClientGoal(hydrated), goalJustCompleted: justCompleted });
});

// --- Custom: log progress (shape depends on measureType) ---

router.post('/:id/log', async (req, res) => {
  const goal = await getGoal(req.params.id, req.user.id);
  if (!goal || goal.type !== 'custom') return res.status(404).json({ error: 'Custom goal not found.' });
  const measureType = goal.details.measureType;
  const today = ptDateString();

  if (measureType === 'yesno') {
    const existing = await findLogByDate(goal.id, today);
    if (existing) return res.status(409).json({ error: 'Already checked in today.' });
    await createLog(goal.id, req.user.id, { date: today, logType: 'completed' });
    await touchGoal(goal.id);
    const hydrated = await hydrateGoal(await getGoal(goal.id, req.user.id));
    return res.json({ goal: toClientGoal(hydrated), goalJustCompleted: false });
  }

  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number.' });
  const newCurrent = Number(goal.details.current || 0) + amount;
  const updated = await updateGoalDetails(goal.id, { ...goal.details, current: newCurrent });
  await createLog(goal.id, req.user.id, { date: today, logType: 'progress', value: amount });

  const { goal: refreshedGoal, justCompleted } = await reCheckCompletion(updated.id, req.user.id);
  const hydrated = await hydrateGoal(refreshedGoal);
  res.json({ goal: toClientGoal(hydrated), goalJustCompleted: justCompleted });
});

export default router;
