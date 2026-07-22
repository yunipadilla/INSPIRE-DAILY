import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ptDateString, isSundayPT, deadlineLabelFor } from '../config/pacificTime.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../config/constants.js';
import { calculateSummerPoints } from '../lib/summerChallenge.js';
import { findByUserAndDate, insertSummerEntry } from '../repositories/summerEntries.js';

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

router.get('/today', async (req, res) => {
  const today = ptDateString();
  const isLaunched = today >= SUMMER_CHALLENGE_LAUNCH_DATE;
  const sunday = isSundayPT();
  const existing = isLaunched && !sunday ? await findByUserAndDate(req.user.id, today) : null;

  res.json({
    date: today,
    launchDate: SUMMER_CHALLENGE_LAUNCH_DATE,
    isLaunched,
    isSunday: sunday,
    alreadySubmitted: Boolean(existing),
    existing: existing ? toClientEntry(existing) : null,
    deadlineLabel: deadlineLabelFor(today),
  });
});

router.post('/', async (req, res) => {
  const today = ptDateString();

  if (today < SUMMER_CHALLENGE_LAUNCH_DATE) {
    return res.status(400).json({ error: 'The Summer Challenge has not launched yet.' });
  }
  if (isSundayPT()) {
    return res.status(400).json({
      error: 'Today is Sunday — your rest day. The Summer Challenge is not required today.',
    });
  }

  const existing = await findByUserAndDate(req.user.id, today);
  if (existing) {
    return res.status(409).json({ error: 'You have already submitted your Summer Challenge points for today.' });
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
  const record = await insertSummerEntry(req.user.id, today, values, totalPoints);

  res.status(201).json({ totalPoints: Number(record.total_points) });
});

export default router;
