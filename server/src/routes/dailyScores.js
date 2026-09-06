import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { dailyScoreSchema } from '../lib/validators.js';
import { ptDayOfWeek } from '../config/pacificTime.js';
import { getSubmissionWindow, isEligibleSubmissionDate, eligibilityMessageFor } from '../lib/submissionWindow.js';
import {
  findByUserAndDate,
  listDatesForUser,
  insertDailyScore,
} from '../repositories/dailyScores.js';
import { applySubmission, STREAK_CONSTANTS } from '../lib/streakEngine.js';
import { updateStreakFields } from '../repositories/users.js';
import { postCelebration } from '../repositories/celebrationFeed.js';
import { getCheckpointForUser } from '../repositories/base44Checkpoints.js';

const router = Router();

function dayStatus(existing) {
  return existing
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
    : null;
}

/**
 * Everything the UI needs to render the Reflection Date chooser and decide
 * what to pre-select — the server is authoritative on eligibility, the
 * client only ever displays what this endpoint says. Both today's and
 * yesterday's (if in-window) existing-submission state are returned in one
 * call so the UI can switch between them without a second round trip.
 */
router.get('/today', requireAuth, async (req, res) => {
  const w = getSubmissionWindow();

  if (w.todayIsSunday) {
    return res.json({
      window: w,
      today: { date: w.today, isSunday: true, alreadySubmitted: false, existing: null },
      yesterday: null,
      streakCount: req.user.streak_count,
      streakShields: req.user.streak_shields,
    });
  }

  const [todayExisting, yesterdayExisting] = await Promise.all([
    findByUserAndDate(req.user.id, w.today),
    w.yesterdayEligible ? findByUserAndDate(req.user.id, w.yesterday) : Promise.resolve(null),
  ]);

  res.json({
    window: w,
    today: {
      date: w.today,
      isSunday: false,
      alreadySubmitted: Boolean(todayExisting),
      existing: dayStatus(todayExisting),
    },
    yesterday: w.yesterdayEligible
      ? {
          date: w.yesterday,
          eligible: true,
          alreadySubmitted: Boolean(yesterdayExisting),
          existing: dayStatus(yesterdayExisting),
        }
      : {
          date: w.yesterday,
          eligible: false,
          isSunday: ptDayOfWeek(w.yesterday) === 0,
          message: eligibilityMessageFor(w.yesterday),
        },
    streakCount: req.user.streak_count,
    streakShields: req.user.streak_shields,
  });
});

router.post('/', requireAuth, async (req, res) => {
  const requestedDate = req.body?.date;
  // No `date` supplied at all falls back to today — the only implicit
  // default the server itself will ever apply. Any explicit date, valid or
  // not, is validated as given and never silently rewritten.
  const targetDate = requestedDate !== undefined ? requestedDate : getSubmissionWindow().today;

  if (!isEligibleSubmissionDate(targetDate)) {
    return res.status(400).json({ error: eligibilityMessageFor(targetDate) });
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
  const checkpointRow = await getCheckpointForUser(req.user.id);
  const checkpoint = checkpointRow
    ? { checkpointDate: checkpointRow.checkpoint_date, streakCheckpoint: checkpointRow.streak_checkpoint }
    : null;
  const { streakCount, streakShields, earnedShield } = applySubmission({
    streakCount: req.user.streak_count,
    streakShields: req.user.streak_shields,
    submittedDates: priorDates,
    dateJustSubmitted: targetDate,
    checkpoint,
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
    date: targetDate,
    totalScore: record.total_score,
    streakCount,
    streakShields,
    earnedShield,
    maxShields: STREAK_CONSTANTS.MAX_SHIELDS,
  });
});

export default router;
