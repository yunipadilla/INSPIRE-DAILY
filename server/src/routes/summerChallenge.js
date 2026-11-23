import { Router } from 'express';
import { currentMonthBoundsPT, isFridayPT } from '../config/pacificTime.js';
import { requireAuth } from '../middleware/auth.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../config/constants.js';
import { calculateSummerPoints, buildSummerEntryValues } from '../lib/summerChallenge.js';
import { getSubmissionWindow, isEligibleSubmissionDate, eligibilityMessageFor } from '../lib/submissionWindow.js';
import { findByUserAndDate, insertSummerEntry, monthlySummerLeaderboard } from '../repositories/summerEntries.js';
import { findAcknowledgement, acknowledgeRestDay } from '../repositories/restDayAcknowledgements.js';
import { resolveVolunteerMinutesForUser, minutesToHours } from '../services/volunteerTimeService.js';

const REST_DAY_SOURCE = 'inspire_challenge';
const router = Router();
router.use(requireAuth);

function toClientEntry(e) {
  return {
    sleepBedBefore10: e.sleep_bed_before_10,
    sleep8h: e.sleep_8h,
    hydration: e.hydration,
    exercise: e.exercise,
    screenTimeTier: e.screen_time_tier,
    mindfulnessSessions: e.mindfulness_sessions,
    readingSessions: e.reading_sessions,
    dailyUpdateSent: e.daily_update_sent,
    nutrition: e.nutrition,
    coldPlungeType: e.cold_plunge_type,
    projectMinutes: e.project_minutes || 0,
    totalPoints: Number(e.total_points),
  };
}

/**
 * Same canonical window as Daily Scores (server/src/lib/submissionWindow.js)
 * — the UI never decides eligibility on its own. Returns both today's and
 * yesterday's (if in-window) existing-entry state in one call, same shape
 * convention as GET /api/daily-scores/today.
 */
router.get('/today', async (req, res) => {
  const w = getSubmissionWindow();
  const isLaunched = w.today >= SUMMER_CHALLENGE_LAUNCH_DATE;
  const { start: monthStart, end: monthEnd } = currentMonthBoundsPT();

  // Canonical resolver — legacy Daily Score hours before the Project Work
  // launch date, current Challenge project_minutes on/after it, never both
  // for the same day. See services/volunteerTimeService.js.
  const volunteerMinutesThisMonth = await resolveVolunteerMinutesForUser(req.user.id, monthStart, monthEnd);

  if (!isLaunched) {
    return res.json({
      window: w,
      isLaunched,
      launchDate: SUMMER_CHALLENGE_LAUNCH_DATE,
      today: { date: w.today, isSunday: w.todayIsSunday, alreadySubmitted: false, existing: null },
      yesterday: null,
      volunteerHoursThisMonth: minutesToHours(volunteerMinutesThisMonth),
    });
  }

  // 2026-09-06 hotfix: today being Sunday no longer short-circuits this
  // response before checking whether Saturday's window is still open — see
  // routes/dailyScores.js's GET /today for the full explanation (same bug,
  // same fix, same shared submissionWindow.js source of truth).
  const [todayExisting, yesterdayExisting, yesterdayAck] = await Promise.all([
    w.todayIsSunday ? Promise.resolve(null) : findByUserAndDate(req.user.id, w.today),
    w.yesterdayEligible ? findByUserAndDate(req.user.id, w.yesterday) : Promise.resolve(null),
    w.yesterdayIsSunday ? findAcknowledgement(req.user.id, w.yesterday, REST_DAY_SOURCE) : Promise.resolve(null),
  ]);

  res.json({
    window: w,
    isLaunched,
    launchDate: SUMMER_CHALLENGE_LAUNCH_DATE,
    today: w.todayIsSunday
      ? { date: w.today, isSunday: true, alreadySubmitted: false, existing: null }
      : {
          date: w.today,
          isSunday: false,
          alreadySubmitted: Boolean(todayExisting),
          existing: todayExisting ? toClientEntry(todayExisting) : null,
        },
    yesterday: w.yesterdayIsSunday
      ? { date: w.yesterday, isSunday: true, acknowledged: Boolean(yesterdayAck) }
      : w.yesterdayEligible
        ? {
            date: w.yesterday,
            eligible: true,
            alreadySubmitted: Boolean(yesterdayExisting),
            existing: yesterdayExisting ? toClientEntry(yesterdayExisting) : null,
          }
        : {
            date: w.yesterday,
            eligible: false,
            isSunday: false,
            message: eligibilityMessageFor(w.yesterday),
          },
    volunteerHoursThisMonth: minutesToHours(volunteerMinutesThisMonth),
  });
});

/** Confirms "yesterday was a rest day" for Inspire Challenge — same narrow
 * acknowledgement mechanism as Daily Scores, own `source` so each surfaces
 * its own confirmation independently. Never writes a summer_entries row. */
router.post('/rest-day-ack', async (req, res) => {
  const w = getSubmissionWindow();
  if (!w.yesterdayIsSunday || req.body?.date !== w.yesterday) {
    return res.status(400).json({ error: 'There is no rest day pending acknowledgement right now.' });
  }
  const record = await acknowledgeRestDay(req.user.id, w.yesterday, REST_DAY_SOURCE);
  res.status(201).json({ date: record.rest_date, acknowledgedAt: record.acknowledged_at });
});

/**
 * Participant-facing leaderboard — visible only on Fridays, Pacific Time;
 * hidden every other day (server-authoritative, not a client-side date
 * check). HQ's own leaderboard (services/hq/challengeService.js /
 * getChallengeLeaderboard, staff-only) is unaffected and available every day.
 */
router.get('/leaderboard', async (req, res) => {
  if (!isFridayPT()) {
    return res.json({ entries: [], visible: false });
  }
  const { start, end } = currentMonthBoundsPT();
  const rows = await monthlySummerLeaderboard(start, end);
  const top5 = rows.slice(0, 5).map((r, i) => ({
    rank: i + 1,
    id: r.id,
    firstName: r.first_name,
    lastInitial: r.last_name?.[0] || '',
    appRole: r.app_role,
    profilePhotoUrl: r.profile_photo_url,
    score: Number(r.score),
    isCurrentUser: r.id === req.user.id,
  }));
  res.json({ entries: top5, visible: true });
});

router.post('/', async (req, res) => {
  const w = getSubmissionWindow();
  const requestedDate = req.body?.date;
  const targetDate = requestedDate !== undefined ? requestedDate : w.today;

  if (targetDate < SUMMER_CHALLENGE_LAUNCH_DATE) {
    return res.status(400).json({ error: 'The Inspire Challenge has not launched yet.' });
  }
  if (!isEligibleSubmissionDate(targetDate)) {
    return res.status(400).json({ error: eligibilityMessageFor(targetDate) });
  }

  const existing = await findByUserAndDate(req.user.id, targetDate);
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted your Inspire Challenge points for that date.' });
  }

  const values = buildSummerEntryValues(req.body, targetDate);

  const totalPoints = calculateSummerPoints(values, targetDate);
  let record;
  try {
    record = await insertSummerEntry(req.user.id, targetDate, values, totalPoints);
  } catch (err) {
    // Two simultaneous submissions for the same day: the database's
    // UNIQUE (user_id, date) lets exactly one win. The loser is a duplicate,
    // not a server error — and can never add a second day's points.
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'You have already submitted your Inspire Challenge points for that date.' });
    }
    throw err;
  }

  res.status(201).json({ date: targetDate, totalPoints: Number(record.total_points) });
});

export default router;
