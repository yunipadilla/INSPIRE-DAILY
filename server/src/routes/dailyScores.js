import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { dailyScoreSchema } from '../lib/validators.js';
import { ptDateString, ptDayOfWeek, isSundayPT, isBeforeNoonPT, addDays, deadlineLabelFor } from '../config/pacificTime.js';
import {
  findByUserAndDate,
  listDatesForUser,
  insertDailyScore,
} from '../repositories/dailyScores.js';
import { applySubmission, STREAK_CONSTANTS } from '../lib/streakEngine.js';
import { updateStreakFields } from '../repositories/users.js';
import { postCelebration } from '../repositories/celebrationFeed.js';

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Yesterday is only ever a valid submission target as an explicit catch-up
 * action, never a silent default: before noon PT (streakEngine's own grace
 * window), a non-Sunday yesterday that the user hasn't submitted yet. Used
 * both to advertise the option on GET /today and to validate an explicit
 * `date` on POST — the caller must ask for it, it's never assumed.
 */
async function catchUpWindow(userId) {
  const today = ptDateString();
  const yesterday = addDays(today, -1);
  if (!isBeforeNoonPT() || ptDayOfWeek(yesterday) === 0) {
    return { available: false, date: yesterday };
  }
  const yesterdayRecord = await findByUserAndDate(userId, yesterday);
  return {
    available: !yesterdayRecord,
    date: yesterday,
    deadlineLabel: deadlineLabelFor(yesterday),
  };
}

router.get('/today', requireAuth, async (req, res) => {
  const today = ptDateString();
  const sunday = isSundayPT();
  const existing = sunday ? null : await findByUserAndDate(req.user.id, today);
  const catchUp = sunday ? { available: false, date: addDays(today, -1) } : await catchUpWindow(req.user.id);

  res.json({
    date: today,
    isSunday: sunday,
    alreadySubmitted: Boolean(existing),
    existing: existing
      ? {
          displayName: existing.display_name,
          challenges: existing.challenges,
          earnedWay: existing.earned_way,
          volunteerHours: existing.volunteer_hours,
          bestSelf: existing.best_self,
          ceoMindset: existing.ceo_mindset,
          grit: existing.grit,
          happiness: existing.happiness,
          sleep: existing.sleep,
          goalsWorkedOn: existing.goals_worked_on,
          totalScore: existing.total_score,
        }
      : null,
    streakCount: req.user.streak_count,
    streakShields: req.user.streak_shields,
    deadlineLabel: deadlineLabelFor(today),
    catchUp,
  });
});

router.post('/', requireAuth, async (req, res) => {
  if (isSundayPT()) {
    return res.status(400).json({
      error: 'Today is Sunday — your rest day. Daily Scores are not required today.',
    });
  }

  const today = ptDateString();
  const requestedDate = req.body?.date;
  let targetDate = today;

  // Yesterday is accepted ONLY as an explicit, validated catch-up request —
  // never inferred. Anything else supplied as `date` is rejected outright.
  if (requestedDate !== undefined && requestedDate !== today) {
    if (!DATE_RE.test(requestedDate)) {
      return res.status(400).json({ error: 'Invalid date.' });
    }
    const catchUp = await catchUpWindow(req.user.id);
    if (requestedDate !== catchUp.date || !catchUp.available) {
      return res.status(400).json({ error: 'That date is not open for submission.' });
    }
    targetDate = catchUp.date;
  }

  const parsed = dailyScoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid submission.' });
  }

  const existing = await findByUserAndDate(req.user.id, targetDate);
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted your Daily Scores for that date.' });
  }

  const record = await insertDailyScore(req.user.id, targetDate, parsed.data);

  const priorDates = await listDatesForUser(req.user.id);
  const { streakCount, streakShields, earnedShield } = applySubmission({
    streakCount: req.user.streak_count,
    streakShields: req.user.streak_shields,
    submittedDates: priorDates,
    dateJustSubmitted: targetDate,
  });

  await updateStreakFields(req.user.id, {
    streak_count: streakCount,
    streak_shields: streakShields,
    streak_last_date: targetDate,
  });

  if (earnedShield) {
    await postCelebration({
      type: 'shield_earned',
      userId: req.user.id,
      message: `${req.user.first_name} earned a streak shield! 🛡️`,
    });
  }
  if (streakCount > 0 && streakCount % 7 === 0) {
    await postCelebration({
      type: 'streak_milestone',
      userId: req.user.id,
      message: `${req.user.first_name} just hit a ${streakCount}-day streak! 🔥`,
    });
  }

  res.status(201).json({
    totalScore: record.total_score,
    streakCount,
    streakShields,
    earnedShield,
    maxShields: STREAK_CONSTANTS.MAX_SHIELDS,
  });
});

export default router;
