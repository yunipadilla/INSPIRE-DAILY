import { Router } from 'express';
import { listMembers, getMemberProfile } from '../../services/hq/memberService.js';
import { getMemberChallengeCategoryBreakdown } from '../../services/hq/challengeService.js';
import { ALL_APP_ROLES, activateUser, suspendUser, deleteUserPermanently, findById } from '../../repositories/users.js';
import { requireHQAdmin } from '../../middleware/auth.js';
import { buildWeeklySummary, buildMonthlySummary } from '../../services/hq/summaryAgentService.js';
import { renderSummaryPdf } from '../../services/hq/summaryAgentPdf.js';
import { buildReportRelativePath, saveReportPdf, readReportPdf } from '../../lib/reportStorage.js';
import { insertReportSummary, listReportSummariesForUser, findReportSummaryById } from '../../repositories/reportSummaries.js';

const router = Router();

const VALID_ACCOUNT_STATUSES = ['pending', 'approved', 'denied'];
const VALID_ACTIVITY_STATES = ['active', 'inactive'];
const VALID_SORTS = ['name', 'email', 'streak', 'createdAt', 'lastActivity'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toClientMember(m) {
  return {
    id: m.id,
    firstName: m.first_name,
    lastName: m.last_name,
    fullName: `${m.first_name} ${m.last_name}`,
    email: m.email,
    profilePhotoUrl: m.profile_photo_url,
    appRole: m.app_role,
    accountStatus: m.account_status,
    streakCount: m.streak_count,
    streakShields: m.streak_shields,
    createdAt: m.created_at,
    lastActivity: m.last_activity,
    activeGoals: m.active_goals,
    badgeCount: m.badge_count,
    challengePoints: Number(m.challenge_points),
  };
}

router.get('/', async (req, res) => {
  const { search, appRole, accountStatus, activityState, sort, direction, page, pageSize } = req.query;

  if (appRole && !ALL_APP_ROLES.includes(appRole)) {
    return res.status(400).json({ error: 'Invalid appRole filter.' });
  }
  if (accountStatus && !VALID_ACCOUNT_STATUSES.includes(accountStatus)) {
    return res.status(400).json({ error: 'Invalid accountStatus filter.' });
  }
  if (sort && !VALID_SORTS.includes(sort)) {
    return res.status(400).json({ error: 'Invalid sort field.' });
  }
  if (activityState && !VALID_ACTIVITY_STATES.includes(activityState)) {
    return res.status(400).json({ error: 'Invalid activityState filter.' });
  }

  const result = await listMembers({
    search: typeof search === 'string' ? search.trim().slice(0, 100) : undefined,
    appRole: typeof appRole === 'string' ? appRole : undefined,
    accountStatus: typeof accountStatus === 'string' ? accountStatus : undefined,
    activityState: typeof activityState === 'string' ? activityState : undefined,
    sort,
    direction,
    page,
    pageSize,
  });

  res.json({
    members: result.members.map(toClientMember),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

router.get('/:id', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid member id.' });
  }

  const profile = await getMemberProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Member not found.' });

  res.json({
    user: {
      id: profile.user.id,
      firstName: profile.user.first_name,
      lastName: profile.user.last_name,
      fullName: `${profile.user.first_name} ${profile.user.last_name}`,
      email: profile.user.email,
      phone: profile.user.phone,
      profilePhotoUrl: profile.user.profile_photo_url,
      appRole: profile.user.app_role,
      accountStatus: profile.user.account_status,
      streakCount: profile.user.streak_count,
      streakShields: profile.user.streak_shields,
      streakLastDate: profile.user.streak_last_date,
      createdAt: profile.user.created_at,
      approvedAt: profile.user.approved_at,
    },
    dailyScores: profile.dailyScores.map((d) => ({
      date: d.date,
      totalScore: d.total_score,
      bestSelf: d.best_self,
      ceoMindset: d.ceo_mindset,
      grit: d.grit,
      happiness: d.happiness,
      sleep: d.sleep,
      volunteerHours: d.volunteer_hours,
      earnedWay: d.earned_way,
      challenges: d.challenges,
      goalsWorkedOn: d.goals_worked_on,
    })),
    goals: profile.goals.map((g) => ({
      id: g.id,
      type: g.type,
      name: g.name,
      completed: g.completed,
      completedDate: g.completed_date,
      targetDate: g.target_date,
      createdAt: g.created_at,
      // Reconstructed-historical goals are stamped with details.legacyGoalId
      // at import time — surfaced here so the UI can label them, never to
      // invent a type or hide that they're historical.
      isHistoricalImport: Boolean(g.details?.legacyGoalId),
      books: (g.books || []).map((b) => ({
        id: b.id, title: b.title, author: b.author, totalPages: b.total_pages,
        currentPage: b.current_page, completed: b.completed, completedDate: b.completed_date,
      })),
      logs: (g.logs || []).map((l) => ({ id: l.id, date: l.date, logType: l.log_type, value: l.value, note: l.note, activity: l.activity })),
    })),
    // `challenge` = current Challenge period only (see memberService's
    // resolveMonthBounds() usage). `challengeAllTime` is the separate,
    // explicitly-labeled all-time figure — never displayed as if current.
    challenge: profile.challenge
      ? { totalPoints: Number(profile.challenge.total_points), daysLogged: profile.challenge.days_logged }
      : { totalPoints: 0, daysLogged: 0 },
    challengeAllTime: profile.challengeAllTime
      ? { totalPoints: Number(profile.challengeAllTime.total_points), daysLogged: profile.challengeAllTime.days_logged }
      : { totalPoints: 0, daysLogged: 0 },
    challengePeriod: profile.challengePeriod,
    // Auditable, clearly-separate provenance for any approved Base44
    // transition checkpoint applied to this participant's current
    // streak/Challenge figures above — never itself presented as a raw
    // submission (see repositories/base44Checkpoints.js).
    base44Checkpoint: profile.base44Checkpoint,
    challengeHistory: profile.challengeHistory.map((c) => ({
      date: c.date,
      totalPoints: Number(c.total_points),
      submittedAt: c.submitted_at,
      sleepBedBefore10: c.sleep_bed_before_10,
      sleep8h: c.sleep_8h,
      hydration: c.hydration,
      exercise: c.exercise,
      screenTimeTier: c.screen_time_tier,
      mindfulnessSessions: c.mindfulness_sessions,
      readingSessions: c.reading_sessions,
      dailyUpdateSent: c.daily_update_sent,
      nutrition: c.nutrition,
      coldPlungeType: c.cold_plunge_type,
    })),
    tasks: profile.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      level: t.level,
      status: t.status,
      hoursSpent: t.hours_spent,
      notes: t.notes,
      completedDate: t.completed_date,
      createdAt: t.created_at,
    })),
    badges: profile.badges.map((b) => ({
      id: b.id,
      badgeType: b.badge_type,
      name: b.name,
      description: b.description,
      iconEmoji: b.icon_emoji,
      earnedDate: b.earned_date,
      reason: b.reason,
      source: b.source,
      triggerKey: b.trigger_key,
      awardedByName: b.awarded_by_first_name ? `${b.awarded_by_first_name} ${b.awarded_by_last_name}` : null,
    })),
    volunteerHours: profile.volunteerHours,
    legacyStatus: profile.legacyStatus,
    timeline: profile.timeline.map((t) => ({
      type: t.type,
      occurredAt: t.occurred_at,
      description: t.description,
    })),
  });
});

// Per-day Inspire Challenge category audit for one member, one month — see
// getMemberChallengeCategoryBreakdown for why this is a separate endpoint
// from the profile itself (a month selector, not just the last-30 rows the
// profile's overview already carries).
router.get('/:id/challenge-breakdown', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid member id.' });
  const { month } = req.query;
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month. Expected YYYY-MM.' });
  }
  const target = await findById(req.params.id);
  if (!target || target.system_role !== 'participant') return res.status(404).json({ error: 'Member not found.' });

  const breakdown = await getMemberChallengeCategoryBreakdown(req.params.id, typeof month === 'string' ? month : undefined);
  res.json({
    month: breakdown.month,
    monthStart: breakdown.monthStart,
    monthEnd: breakdown.monthEnd,
    categories: breakdown.categories,
    rows: breakdown.rows.map((r) => ({
      date: r.date,
      submittedAt: r.submittedAt,
      categories: r.categories,
      projectMinutes: r.projectMinutes,
      coldPlungeType: r.coldPlungeType,
      screenTimeTier: r.screenTimeTier,
      storedTotal: r.storedTotal,
      computedTotal: r.computedTotal,
      mismatch: r.mismatch,
    })),
    checkpointSummary: breakdown.checkpointSummary,
  });
});

// ─── Account management — Admin/Super Admin only (see requireHQAdmin) ──────
// Suspension is preferred; permanent deletion is destructive and requires
// the caller to echo back the exact account email as an explicit
// confirmation, so it can never fire from a stray click.

router.post('/:id/suspend', requireHQAdmin, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid member id.' });
  const user = await suspendUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Member not found.' });
  res.json({ accountStatus: user.account_status });
});

router.post('/:id/activate', requireHQAdmin, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid member id.' });
  const user = await activateUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Member not found.' });
  res.json({ accountStatus: user.account_status });
});

router.delete('/:id', requireHQAdmin, async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid member id.' });
  const target = await findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Member not found.' });
  if (target.system_role !== 'participant') {
    return res.status(400).json({ error: 'Only participant accounts can be deleted from this screen.' });
  }
  const { confirmEmail } = req.body || {};
  if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
    return res.status(400).json({ error: 'Type the account\'s exact email address to confirm permanent deletion.' });
  }
  const deleted = await deleteUserPermanently(req.params.id);
  res.json({ deleted: Boolean(deleted) });
});

// ─── Daily Scores Summary Agent — read-only report generation ──────────────
// Every route here is already gated to staff/admin/super_admin by
// requireHQAccess applied in routes/hq/index.js. Generating a summary never
// writes to daily_scores/summer_entries/goals/task_signups/badges/users —
// the only writes are the PDF file on disk and its report_summaries metadata
// row (see summaryAgentService.js's module doc comment).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

router.post('/:id/summaries', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid member id.' });
  const { reportType, weekStart, month } = req.body || {};
  if (reportType !== 'weekly' && reportType !== 'monthly') {
    return res.status(400).json({ error: 'reportType must be "weekly" or "monthly".' });
  }
  if (weekStart !== undefined && !DATE_RE.test(weekStart)) {
    return res.status(400).json({ error: 'weekStart must be a YYYY-MM-DD date.' });
  }
  if (month !== undefined && !MONTH_RE.test(month)) {
    return res.status(400).json({ error: 'month must be a YYYY-MM value.' });
  }

  const summary = reportType === 'weekly' ? await buildWeeklySummary(req.params.id, weekStart) : await buildMonthlySummary(req.params.id, month);
  if (!summary) return res.status(404).json({ error: 'Member not found.' });

  const pdfBuffer = await renderSummaryPdf(summary);
  const relativePath = buildReportRelativePath({
    firstName: summary.user.firstName,
    lastName: summary.user.lastName,
    reportType: summary.reportType,
    periodStart: summary.period.start,
    periodEnd: summary.period.end,
  });
  const { sizeBytes } = await saveReportPdf(relativePath, pdfBuffer);
  const record = await insertReportSummary({
    userId: req.params.id,
    reportType: summary.reportType,
    periodStart: summary.period.start,
    periodEnd: summary.period.end,
    generatedBy: req.user.id,
    storagePath: relativePath,
    fileSizeBytes: sizeBytes,
  });

  res.status(201).json({
    id: record.id,
    reportType: record.report_type,
    periodStart: record.period_start,
    periodEnd: record.period_end,
    generatedAt: record.generated_at,
    fileSizeBytes: record.file_size_bytes,
    summary,
  });
});

router.get('/:id/summaries', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) return res.status(400).json({ error: 'Invalid member id.' });
  const rows = await listReportSummariesForUser(req.params.id);
  res.json({
    reports: rows.map((r) => ({
      id: r.id,
      reportType: r.report_type,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      generatedAt: r.generated_at,
      fileSizeBytes: r.file_size_bytes,
    })),
  });
});

router.get('/:id/summaries/:reportId/pdf', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id) || !UUID_PATTERN.test(req.params.reportId)) {
    return res.status(400).json({ error: 'Invalid id.' });
  }
  const record = await findReportSummaryById(req.params.reportId, req.params.id);
  if (!record) return res.status(404).json({ error: 'Report not found.' });
  const buffer = await readReportPdf(record.storage_path);
  const filename = record.storage_path.split('/').pop();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${req.query.download ? 'attachment' : 'inline'}; filename="${filename}"`
  );
  res.send(buffer);
});

export default router;
