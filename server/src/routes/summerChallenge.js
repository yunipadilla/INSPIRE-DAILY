import { Router } from 'express';
import { ptDayOfWeek, currentMonthBoundsPT } from '../config/pacificTime.js';
import { requireAuth } from '../middleware/auth.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../config/constants.js';
import { calculateSummerPoints } from '../lib/summerChallenge.js';
import { getSubmissionWindow, isEligibleSubmissionDate, eligibilityMessageFor } from '../lib/submissionWindow.js';
import { findByUserAndDate, insertSummerEntry, monthlySummerLeaderboard } from '../repositories/summerEntries.js';
import { query } from '../db.js';

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

  const volunteerHoursRes = await query(
    'select coalesce(sum(volunteer_hours), 0)::float as hours from daily_scores where user_id = $1 and date between $2 and $3',
    [req.user.id, monthStart, monthEnd]
  );

  if (w.todayIsSunday || !isLaunched) {
    return res.json({
      window: w,
      isLaunched,
      launchDate: SUMMER_CHALLENGE_LAUNCH_DATE,
      today: { date: w.today, isSunday: w.todayIsSunday, alreadySubmitted: false, existing: null },
      yesterday: null,
      volunteerHoursThisMonth: volunteerHoursRes.rows[0].hours,
    });
  }

  const [todayExisting, yesterdayExisting] = await Promise.all([
    findByUserAndDate(req.user.id, w.today),
    w.yesterdayEligible ? findByUserAndDate(req.user.id, w.yesterday) : Promise.resolve(null),
  ]);

  res.json({
    window: w,
    isLaunched,
    launchDate: SUMMER_CHALLENGE_LAUNCH_DATE,
    today: {
      date: w.today,
      isSunday: false,
      alreadySubmitted: Boolean(todayExisting),
      existing: todayExisting ? toClientEntry(todayExisting) : null,
    },
    yesterday: w.yesterdayEligible
      ? {
          date: w.yesterday,
          eligible: true,
          alreadySubmitted: Boolean(yesterdayExisting),
          existing: yesterdayExisting ? toClientEntry(yesterdayExisting) : null,
        }
      : {
          date: w.yesterday,
          eligible: false,
          isSunday: ptDayOfWeek(w.yesterday) === 0,
          message: eligibilityMessageFor(w.yesterday),
        },
    volunteerHoursThisMonth: volunteerHoursRes.rows[0].hours,
  });
});

router.get('/leaderboard', async (req, res) => {
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
  res.json({ entries: top5 });
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

  const values = {
    sleepBedBefore10: Boolean(req.body.sleepBedBefore10),
    sleep8h: Boolean(req.body.sleep8h),
    hydration: Boolean(req.body.hydration),
    exercise: Boolean(req.body.exercise),
    screenTimeTier: [1, 2, 3, 4].includes(Number(req.body.screenTimeTier)) ? Number(req.body.screenTimeTier) : null,
    mindfulnessSessions: Math.max(0, Math.min(3, Number(req.body.mindfulnessSessions) || 0)),
    readingSessions: Math.max(0, Math.min(4, Number(req.body.readingSessions) || 0)),
    dailyUpdateSent: Boolean(req.body.dailyUpdateSent),
    nutrition: Boolean(req.body.nutrition),
    coldPlungeType: ['plunge', 'shower', 'none'].includes(req.body.coldPlungeType) ? req.body.coldPlungeType : null,
  };

  const totalPoints = calculateSummerPoints(values);
  const record = await insertSummerEntry(req.user.id, targetDate, values, totalPoints);

  res.status(201).json({ date: targetDate, totalPoints: Number(record.total_points) });
});

export default router;
