import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getSubmissionWindow, eligibilityMessageFor } from '../lib/submissionWindow.js';

const router = Router();

/**
 * The single authoritative eligibility snapshot — Daily Scores and Inspire
 * Challenge both compute this same shape internally (see
 * server/src/lib/submissionWindow.js); this endpoint exists so the client
 * (or any future feature) can read it directly rather than re-deriving
 * eligibility from wall-clock time on the device, which is never trusted.
 */
router.get('/', requireAuth, (req, res) => {
  const w = getSubmissionWindow();
  res.json({
    today: w.today,
    yesterday: w.yesterday,
    yesterdayEligible: w.yesterdayEligible,
    todayIsSunday: w.todayIsSunday,
    cutoff: w.cutoffLabel,
    defaultDate: w.defaultDate,
    eligibilityMessage: w.yesterdayEligible ? null : eligibilityMessageFor(w.yesterday),
  });
});

export default router;
