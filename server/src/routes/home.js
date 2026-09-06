import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db.js';
import { ptDateString, isSundayPT, currentWeekBoundsPT } from '../config/pacificTime.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../config/constants.js';
import { findByUserAndDate as findDailyScore } from '../repositories/dailyScores.js';
import { resolveMonthBounds } from '../services/hq/challengeService.js';
import { eligibleDayCount } from '../lib/reportingWindow.js';
import { listActiveCelebrations } from '../repositories/celebrationFeed.js';
import { getCheckpointForUser } from '../repositories/base44Checkpoints.js';

const router = Router();

router.get('/summary', requireAuth, async (req, res) => {
  const today = ptDateString();
  const sunday = isSundayPT();
  const { start: weekStart } = currentWeekBoundsPT();
  const { start: challengeStart, end: challengeEnd } = resolveMonthBounds();
  const challengeWindowEnd = today < challengeEnd ? today : challengeEnd;
  const periodKey = challengeStart.slice(0, 7);
  const checkpointRow = await getCheckpointForUser(req.user.id);
  const checkpointAppliesHere = checkpointRow && checkpointRow.challenge_period === periodKey;
  const cpDateBound = checkpointAppliesHere ? checkpointRow.checkpoint_date : '1899-12-31';

  const [
    badgeCountRes,
    activeGoalsRes,
    goalsWorkedOnRes,
    dailyScoreToday,
    challengeEntryToday,
    weekSubmissionsRes,
    challengeSubmissionsRes,
  ] = await Promise.all([
    query('select count(*)::int as count from badges where user_id = $1', [req.user.id]),
    query('select count(*)::int as count from goals where user_id = $1 and completed = false', [req.user.id]),
    query(
      'select count(distinct goal_id)::int as count from goal_logs where user_id = $1 and date >= $2 and date <= $3',
      [req.user.id, weekStart, today]
    ),
    sunday ? null : findDailyScore(req.user.id, today),
    query('select 1 from summer_entries where user_id = $1 and date = $2', [req.user.id, today]),
    query(
      'select count(*)::int as count from daily_scores where user_id = $1 and date >= $2 and date <= $3',
      [req.user.id, weekStart, today]
    ),
    query(
      'select count(distinct date)::int as count from summer_entries where user_id = $1 and date >= $2 and date <= $3 and date > $4::date',
      [req.user.id, challengeStart, challengeWindowEnd, cpDateBound]
    ),
  ]);

  const challengeLaunched = today >= SUMMER_CHALLENGE_LAUNCH_DATE;

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
    weeklyProgress: {
      submitted: weekSubmissionsRes.rows[0].count,
      eligibleDays: eligibleDayCount(weekStart, today),
    },
    // Current Inspire Challenge period only (never all-time) — same shared
    // resolveMonthBounds() the HQ Challenge page and leaderboard use.
    challengeProgress: challengeLaunched
      ? {
          submitted: challengeSubmissionsRes.rows[0].count + (checkpointAppliesHere ? checkpointRow.challenge_days_checkpoint : 0),
          eligibleDays: eligibleDayCount(challengeStart, challengeWindowEnd),
        }
      : null,
    goalsWorkedOnThisWeek: goalsWorkedOnRes.rows[0].count,
    todaysActions: {
      dailyScores: sunday ? 'rest_day' : dailyScoreToday ? 'done' : 'start',
      inspireChallenge: !challengeLaunched
        ? 'coming_soon'
        : sunday
          ? 'rest_day'
          : challengeEntryToday.rows.length
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

export default router;
