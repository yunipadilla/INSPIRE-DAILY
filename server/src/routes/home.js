import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db.js';
import { ptDateString, isSundayPT, currentMonthBoundsPT } from '../config/pacificTime.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../config/constants.js';
import { findByUserAndDate as findDailyScore } from '../repositories/dailyScores.js';
import { monthlyLeaderboard } from '../repositories/dailyScores.js';
import { listActiveCelebrations } from '../repositories/celebrationFeed.js';

const router = Router();

router.get('/summary', requireAuth, async (req, res) => {
  const today = ptDateString();
  const sunday = isSundayPT();

  const [badgeCountRes, activeGoalsRes, dailyScoreToday, summerEntryToday] = await Promise.all([
    query('select count(*)::int as count from badges where user_id = $1', [req.user.id]),
    query('select count(*)::int as count from goals where user_id = $1 and completed = false', [
      req.user.id,
    ]),
    sunday ? null : findDailyScore(req.user.id, today),
    query('select 1 from summer_entries where user_id = $1 and date = $2', [req.user.id, today]),
  ]);

  const summerLaunched = today >= SUMMER_CHALLENGE_LAUNCH_DATE;

  res.json({
    firstName: req.user.first_name,
    isSunday: sunday,
    stats: {
      streakCount: req.user.streak_count,
      badgesCount: badgeCountRes.rows[0].count,
      activeGoalsCount: activeGoalsRes.rows[0].count,
      streakShields: req.user.streak_shields,
      maxShields: 3,
    },
    todaysActions: {
      dailyScores: sunday ? 'rest_day' : dailyScoreToday ? 'done' : 'start',
      summerChallenge: !summerLaunched
        ? 'coming_soon'
        : sunday
          ? 'rest_day'
          : summerEntryToday.rows.length
            ? 'done'
            : 'start',
      goals: 'start',
      internshipTasks: req.user.app_role === 'alumni' ? 'hidden' : 'start',
    },
  });
});

router.get('/celebration-feed', requireAuth, async (req, res) => {
  const items = await listActiveCelebrations();
  res.json({
    items: items.map((i) => ({
      id: i.id,
      type: i.type,
      message: i.message,
      createdAt: i.created_at,
    })),
  });
});

router.get('/leaderboard-preview', requireAuth, async (req, res) => {
  const { start, end } = currentMonthBoundsPT();
  const rows = await monthlyLeaderboard(start, end);
  const isGuest = req.user.app_role === 'alumni' || req.user.app_role === 'staff';

  const top5 = rows.slice(0, 5).map((r, i) => ({
    rank: i + 1,
    id: r.id,
    firstName: r.first_name,
    lastInitial: r.last_name?.[0] || '',
    appRole: r.app_role,
    profilePhotoUrl: r.profile_photo_url,
    score: r.score,
    isCurrentUser: r.id === req.user.id,
  }));

  res.json({
    isGuest,
    guestNote: isGuest ? 'Viewing as guest — participation is open to Interns and Postgrads only.' : null,
    entries: top5,
  });
});

export default router;
