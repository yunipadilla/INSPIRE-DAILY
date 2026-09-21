import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { dailyScoreSchema } from '../lib/validators.js';
import { getSubmissionWindow, isEligibleSubmissionDate, eligibilityMessageFor } from '../lib/submissionWindow.js';
import {
  findByUserAndDate,
  listDatesForUser,
  insertDailyScore,
} from '../repositories/dailyScores.js';
import { applySubmission, STREAK_CONSTANTS } from '../lib/streakEngine.js';
import { postCelebration } from '../repositories/celebrationFeed.js';
import { getCheckpointForUser } from '../repositories/base44Checkpoints.js';
import { findAcknowledgement, acknowledgeRestDay } from '../repositories/restDayAcknowledgements.js';
import { insertShieldEvent, listBridgedDatesForUser } from '../repositories/streakShieldEvents.js';
import { ptDateString } from '../config/pacificTime.js';
import { withTransaction } from '../db.js';

const REST_DAY_SOURCE = 'daily_scores';

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
 *
 * 2026-09-06 hotfix: today being Sunday no longer short-circuits this whole
 * response — Saturday's own catch-up window (w.yesterdayEligible) must stay
 * available through Sunday noon regardless of what "today" is. `today` is
 * still reported as isSunday so the client knows not to require it, but
 * `yesterday` is now always computed from the real window state.
 */
router.get('/today', requireAuth, async (req, res) => {
  const w = getSubmissionWindow();

  const [todayExisting, yesterdayExisting, yesterdayAck] = await Promise.all([
    w.todayIsSunday ? Promise.resolve(null) : findByUserAndDate(req.user.id, w.today),
    w.yesterdayEligible ? findByUserAndDate(req.user.id, w.yesterday) : Promise.resolve(null),
    w.yesterdayIsSunday ? findAcknowledgement(req.user.id, w.yesterday, REST_DAY_SOURCE) : Promise.resolve(null),
  ]);

  res.json({
    window: w,
    today: w.todayIsSunday
      ? { date: w.today, isSunday: true, alreadySubmitted: false, existing: null }
      : {
          date: w.today,
          isSunday: false,
          alreadySubmitted: Boolean(todayExisting),
          existing: dayStatus(todayExisting),
        },
    yesterday: w.yesterdayIsSunday
      ? { date: w.yesterday, isSunday: true, acknowledged: Boolean(yesterdayAck) }
      : w.yesterdayEligible
        ? {
            date: w.yesterday,
            eligible: true,
            alreadySubmitted: Boolean(yesterdayExisting),
            existing: dayStatus(yesterdayExisting),
          }
        : {
            date: w.yesterday,
            eligible: false,
            isSunday: false,
            message: eligibilityMessageFor(w.yesterday),
          },
    streakCount: req.user.streak_count,
    streakShields: req.user.streak_shields,
  });
});

/**
 * Confirms "yesterday was a rest day" — writes ONLY a narrow acknowledgement
 * row (see repositories/restDayAcknowledgements.js), never a daily_scores
 * row. Rejects anything but the real, currently-applicable Sunday date so a
 * stale/manipulated client can't backfill an acknowledgement for a date that
 * was never actually a pending rest day.
 */
router.post('/rest-day-ack', requireAuth, async (req, res) => {
  const w = getSubmissionWindow();
  if (!w.yesterdayIsSunday || req.body?.date !== w.yesterday) {
    return res.status(400).json({ error: 'There is no rest day pending acknowledgement right now.' });
  }
  const record = await acknowledgeRestDay(req.user.id, w.yesterday, REST_DAY_SOURCE);
  res.status(201).json({ date: record.rest_date, acknowledgedAt: record.acknowledged_at });
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

  const [priorDates, previouslyBridgedDates] = await Promise.all([
    listDatesForUser(req.user.id),
    listBridgedDatesForUser(req.user.id),
  ]);
  const checkpointRow = await getCheckpointForUser(req.user.id);
  const checkpoint = checkpointRow
    ? { checkpointDate: checkpointRow.checkpoint_date, streakCheckpoint: checkpointRow.streak_checkpoint }
    : null;
  const { streakCount, streakShields, earnedShield, shieldProgressAnchor, bridgedDates } = applySubmission({
    streakCount: req.user.streak_count,
    streakShields: req.user.streak_shields,
    submittedDates: priorDates,
    dateJustSubmitted: targetDate,
    checkpoint,
    shieldProgressAnchor: req.user.shield_progress_anchor,
    previouslyBridgedDates,
  });

  // Streak fields and any shield ledger rows (consumed while bridging a gap
  // this submission just discovered, and/or newly earned) commit together —
  // see streakEngine.js's module doc comment for why a submission landing
  // after an unprotected gap must never save the streak without also
  // deducting the shield that protected it, or the reverse.
  await withTransaction(async (client) => {
    await client.query(
      `update users
          set streak_count = $2, streak_shields = $3, streak_last_date = $4,
              shield_progress_anchor = $5, last_streak_reconcile_date = $6
        where id = $1`,
      [req.user.id, streakCount, streakShields, targetDate, shieldProgressAnchor, ptDateString()]
    );
    for (const bridgedDate of bridgedDates) {
      await insertShieldEvent({
        userId: req.user.id,
        eventType: 'consumed',
        amount: -1,
        streakValue: streakCount,
        eventDate: bridgedDate,
        reason: 'Missed required Daily Score day — streak protected by shield.',
        client,
      });
    }
    if (earnedShield) {
      await insertShieldEvent({
        userId: req.user.id,
        eventType: 'earned',
        amount: 1,
        streakValue: streakCount,
        eventDate: targetDate,
        reason: '7 consecutive required Daily Score days completed.',
        client,
      });
    }
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
