import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { dailyScoreSchema } from '../lib/validators.js';
import { ptDateString, ptDayOfWeek, isSundayPT, deadlineLabelFor } from '../config/pacificTime.js';
import {
  findByUserAndDate,
  listDatesForUser,
  insertDailyScore,
} from '../repositories/dailyScores.js';
import { applySubmission, STREAK_CONSTANTS } from '../lib/streakEngine.js';
import { updateStreakFields } from '../repositories/users.js';
import { postCelebration } from '../repositories/celebrationFeed.js';

const router = Router();

router.get('/today', requireAuth, async (req, res) => {
  const today = ptDateString();
  const sunday = isSundayPT();
  const existing = sunday ? null : await findByUserAndDate(req.user.id, today);
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
  });
});

router.post('/', requireAuth, async (req, res) => {
  const today = ptDateString();

  if (isSundayPT()) {
    return res.status(400).json({
      error: 'Today is Sunday — your rest day. Daily Scores are not required today.',
    });
  }

  const parsed = dailyScoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid submission.' });
  }

  const existing = await findByUserAndDate(req.user.id, today);
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted your Daily Scores for today.' });
  }

  const record = await insertDailyScore(req.user.id, today, parsed.data);

  const priorDates = await listDatesForUser(req.user.id);
  const { streakCount, streakShields, earnedShield } = applySubmission({
    streakCount: req.user.streak_count,
    streakShields: req.user.streak_shields,
    submittedDates: priorDates,
    dateJustSubmitted: today,
  });

  await updateStreakFields(req.user.id, {
    streak_count: streakCount,
    streak_shields: streakShields,
    streak_last_date: today,
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
