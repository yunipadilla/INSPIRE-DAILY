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

/**
 * Which date a submission right now is actually "for". Mirrors streakEngine's
 * own grace window: before noon PT, if yesterday (a non-Sunday) is still
 * unsubmitted and today hasn't been submitted either, the user is filling in
 * yesterday's late entry, not starting today's. Otherwise it's today's.
 */
async function resolveSubmissionDate(userId) {
  const today = ptDateString();
  const yesterday = addDays(today, -1);
  if (isBeforeNoonPT() && ptDayOfWeek(yesterday) !== 0) {
    const [todayRecord, yesterdayRecord] = await Promise.all([
      findByUserAndDate(userId, today),
      findByUserAndDate(userId, yesterday),
    ]);
    if (!todayRecord && !yesterdayRecord) return { date: yesterday, isLate: true };
  }
  return { date: today, isLate: false };
}

router.get('/today', requireAuth, async (req, res) => {
  const sunday = isSundayPT();
  const { date, isLate } = sunday ? { date: ptDateString(), isLate: false } : await resolveSubmissionDate(req.user.id);
  const existing = sunday ? null : await findByUserAndDate(req.user.id, date);
  res.json({
    date,
    isSunday: sunday,
    isLate,
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
    deadlineLabel: deadlineLabelFor(date),
  });
});

router.post('/', requireAuth, async (req, res) => {
  if (isSundayPT()) {
    return res.status(400).json({
      error: 'Today is Sunday — your rest day. Daily Scores are not required today.',
    });
  }

  const { date: targetDate } = await resolveSubmissionDate(req.user.id);

  const parsed = dailyScoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid submission.' });
  }

  const existing = await findByUserAndDate(req.user.id, targetDate);
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted your Daily Scores for today.' });
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
