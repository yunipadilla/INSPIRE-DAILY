/**
 * Inspire HQ Monthly Program Snapshot — mounted under /api/hq, so it
 * inherits requireHQAccess (staff/admin/super_admin) from routes/hq/index.js
 * automatically. Program-wide totals are never exposed to participants.
 */
import { Router } from 'express';
import { ptDateString } from '../../config/pacificTime.js';
import { loadMonthlySnapshot, refreshMonthlySnapshot } from '../../services/hq/monthlySnapshotService.js';
import { minutesToHours } from '../../services/volunteerTimeService.js';

const router = Router();

function toClient(snapshot) {
  return {
    year: snapshot.year,
    month: snapshot.month,
    period: snapshot.period,
    totalVolunteerMinutes: snapshot.totalVolunteerMinutes,
    totalVolunteerHours: minutesToHours(snapshot.totalVolunteerMinutes),
    totalChallengePoints: snapshot.totalChallengePoints,
    participantCount: snapshot.participantCount,
    challengeDaysLogged: snapshot.challengeDaysLogged,
    volunteerBreakdown: snapshot.volunteerBreakdown.map((r) => ({
      userId: r.userId,
      name: `${r.firstName} ${r.lastName}`,
      minutes: r.minutes,
      hours: minutesToHours(r.minutes),
    })),
    challengeBreakdown: snapshot.challengeBreakdown.map((r) => ({
      userId: r.userId,
      name: `${r.firstName} ${r.lastName}`,
      points: r.points,
      daysLogged: r.daysLogged,
    })),
    generatedAt: snapshot.snapshot.generated_at,
    updatedAt: snapshot.snapshot.updated_at,
    sourceVersion: snapshot.snapshot.source_version,
    isCurrentMonth: snapshot.year === Number(ptDateString().slice(0, 4)) && snapshot.month === Number(ptDateString().slice(5, 7)),
  };
}

function parseYearMonth(req, res) {
  const now = ptDateString();
  const year = Number(req.query.year) || Number(now.slice(0, 4));
  const month = Number(req.query.month) || Number(now.slice(5, 7));
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: 'Invalid year/month.' });
    return null;
  }
  return { year, month };
}

router.get('/', async (req, res) => {
  const ym = parseYearMonth(req, res);
  if (!ym) return;
  const snapshot = await loadMonthlySnapshot(ym.year, ym.month);
  res.json(toClient(snapshot));
});

router.post('/refresh', async (req, res) => {
  const year = Number(req.body?.year);
  const month = Number(req.body?.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'Invalid year/month.' });
  }
  const snapshot = await refreshMonthlySnapshot(year, month);
  res.json(toClient(snapshot));
});

export default router;
