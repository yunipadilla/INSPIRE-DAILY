import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { query } from '../../db.js';
import { ptDateString, addDays } from '../../config/pacificTime.js';
import { getProgramPerformance } from './overviewService.js';
import { getGoalsOverview } from './goalsService.js';
import { getTasksOverview } from './tasksService.js';
import { getVolunteerHoursOverview } from './volunteerHoursService.js';
import { getChallengeOverview } from './challengeService.js';
import { getMemberProfile } from './memberService.js';
import { listDailyScoresMembers } from './dailyScoresService.js';
import { listGoalsMembers } from './goalsService.js';
import { listTasksMembers } from './tasksService.js';
import { listVolunteerHoursMembers } from './volunteerHoursService.js';
import { listChallengeMembers } from './challengeService.js';

const ATTENTION_NO_SUBMISSION_DAYS = 3;

function pct(n) {
  return n == null ? 'n/a' : `${Math.round(n * 100)}%`;
}

// ─── Data assembly (deterministic — every number traces to a real query) ────

export async function buildProgramReportData() {
  const [participantsRes, performance, goals, tasks, volunteerHours, challenge, badgesRes, inactiveRes] = await Promise.all([
    query(`select count(*)::int as count from users where system_role = 'participant' and account_status = 'approved'`),
    getProgramPerformance(),
    getGoalsOverview({ days: 30 }),
    getTasksOverview({ days: 30 }),
    getVolunteerHoursOverview({ days: 30 }),
    getChallengeOverview({ days: 30 }),
    query(`select count(*)::int as count from badges b join users u on u.id = b.user_id where u.system_role = 'participant'`),
    query(
      `select u.first_name, u.last_name, u.email,
              (select max(ds.date) from daily_scores ds where ds.user_id = u.id) as last_submission
         from users u
        where u.system_role = 'participant' and u.account_status = 'approved'
          and not exists (select 1 from daily_scores ds where ds.user_id = u.id and ds.date >= $1::date - make_interval(days => $2))
        order by last_submission asc nulls first`,
      [ptDateString(), ATTENTION_NO_SUBMISSION_DAYS]
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    periodLabel: 'Last 30 days',
    totalParticipants: participantsRes.rows[0].count,
    participationRate30d: performance.participation30d,
    averageActiveStreak: performance.averageActiveStreak,
    goalCompletionRate: goals.completionRate,
    activeGoals: goals.activeGoals,
    completedGoals: goals.completedGoals,
    tasksCompleted: tasks.completed,
    totalVolunteerHours: volunteerHours.totalHours,
    challengeParticipants: challenge.participants,
    challengeTotalPoints: challenge.totalPoints,
    badgesAwarded: badgesRes.rows[0].count,
    inactiveParticipants: inactiveRes.rows,
  };
}

/** Deterministic narrative sentences generated from real metrics — no AI, no
 * fabricated claims, exactly the numbers the report also shows. */
function programNarrative(d) {
  const lines = [];
  lines.push(`Over the ${d.periodLabel.toLowerCase()}, ${d.totalParticipants} active participants engaged with Inspire Daily.`);
  lines.push(
    d.participationRate30d != null
      ? `30-day Daily Scores participation was ${pct(d.participationRate30d)}, with an average active streak of ${d.averageActiveStreak.toFixed(1)} days.`
      : 'No 30-day Daily Scores participation data is available yet.'
  );
  lines.push(
    `${d.activeGoals} goals are currently active and ${d.completedGoals} have been completed (${pct(d.goalCompletionRate)} completion rate).`
  );
  lines.push(`${d.tasksCompleted} internship tasks were completed, and ${d.totalVolunteerHours.toFixed(1)} volunteer hours were logged.`);
  lines.push(
    d.challengeParticipants > 0
      ? `${d.challengeParticipants} participants logged Inspire Challenge activity, totaling ${d.challengeTotalPoints.toFixed(1)} canonical points.`
      : 'No Inspire Challenge activity was logged in this period.'
  );
  lines.push(`${d.badgesAwarded} badges have been earned program-wide.`);
  if (d.inactiveParticipants.length > 0) {
    lines.push(`${d.inactiveParticipants.length} participant(s) have gone 3+ days without a Daily Scores submission and may need outreach.`);
  }
  return lines;
}

export async function buildParticipantImpactReportData(userId, { days = 30 } = {}) {
  const profile = await getMemberProfile(userId);
  if (!profile) return null;
  const today = ptDateString();
  const start = addDays(today, -(days - 1));
  const scoresInWindow = profile.dailyScores.filter((d) => d.date >= start);
  const challengeInWindow = profile.challengeHistory.filter((c) => c.date >= start);

  return {
    generatedAt: new Date().toISOString(),
    periodLabel: `Last ${days} days`,
    period: { start, end: today },
    user: profile.user,
    dailyScoreSubmissions: scoresInWindow.length,
    streakCount: profile.user.streak_count,
    goals: {
      active: profile.goals.filter((g) => !g.completed).length,
      completed: profile.goals.filter((g) => g.completed).length,
      readingBooksCompleted: profile.goals.filter((g) => g.type === 'reading').flatMap((g) => g.books).filter((b) => b.completed).length,
    },
    tasks: {
      completed: profile.tasks.filter((t) => t.status === 'completed').length,
      hours: profile.tasks.filter((t) => t.status === 'completed').reduce((s, t) => s + Number(t.hours_spent || 0), 0),
    },
    volunteerHours: profile.volunteerHours.total,
    // currentPeriodPoints = active Challenge period only (never inflated by
    // older historical months); allTimePoints is the separate, explicitly
    // labeled figure — see participantNarrative/renderParticipantImpactPdf.
    challenge: {
      entriesInWindow: challengeInWindow.length,
      currentPeriodPoints: Number(profile.challenge.total_points),
      currentPeriodDaysLogged: profile.challenge.days_logged,
      allTimePoints: Number(profile.challengeAllTime.total_points),
      allTimeDaysLogged: profile.challengeAllTime.days_logged,
    },
    badges: profile.badges.map((b) => ({ name: b.name, type: b.badge_type, earnedDate: b.earned_date })),
  };
}

function participantNarrative(d) {
  const lines = [];
  lines.push(`${d.user.first_name} ${d.user.last_name} submitted Daily Scores ${d.dailyScoreSubmissions} time(s) in the ${d.periodLabel.toLowerCase()}, with a current streak of ${d.streakCount} day(s).`);
  lines.push(`${d.goals.active} goal(s) are active and ${d.goals.completed} have been completed${d.goals.readingBooksCompleted ? `, including ${d.goals.readingBooksCompleted} book(s) finished` : ''}.`);
  lines.push(`${d.tasks.completed} internship task(s) were completed, totaling ${d.tasks.hours.toFixed(1)} hours, alongside ${d.volunteerHours.toFixed(1)} volunteer hours logged.`);
  lines.push(`${d.challenge.entriesInWindow} Inspire Challenge entries were logged in this period, worth ${d.challenge.currentPeriodPoints.toFixed(1)} canonical points in the current Challenge period (${d.challenge.allTimePoints.toFixed(1)} points all-time across ${d.challenge.allTimeDaysLogged} day(s)).`);
  lines.push(d.badges.length ? `${d.badges.length} badge(s) earned: ${d.badges.map((b) => b.name).join(', ')}.` : 'No badges earned yet.');
  if (d.dailyScoreSubmissions === 0) lines.push('Area needing attention: no Daily Scores activity in this reporting period.');
  return lines;
}

// ─── PDF rendering (pdfkit) ─────────────────────────────────────────────────

function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function renderProgramReportPdf(data) {
  const doc = new PDFDocument({ margin: 50 });
  doc.fontSize(20).text('Inspire Daily — Program Report', { align: 'left' });
  doc.fontSize(10).fillColor('#666').text(`Generated ${new Date(data.generatedAt).toLocaleString()} — ${data.periodLabel}`);
  doc.moveDown(1.5);
  doc.fillColor('#000').fontSize(12);
  for (const line of programNarrative(data)) {
    doc.text(`•  ${line}`, { paragraphGap: 6 });
  }
  doc.moveDown(1);
  doc.fontSize(14).text('Key Metrics');
  doc.fontSize(11);
  const rows = [
    ['Total participants', data.totalParticipants],
    ['30-day participation', pct(data.participationRate30d)],
    ['Average active streak', `${data.averageActiveStreak.toFixed(1)} days`],
    ['Active goals', data.activeGoals],
    ['Completed goals', data.completedGoals],
    ['Goal completion rate', pct(data.goalCompletionRate)],
    ['Tasks completed', data.tasksCompleted],
    ['Volunteer hours (30d)', data.totalVolunteerHours.toFixed(1)],
    ['Challenge participants', data.challengeParticipants],
    ['Challenge points (current period)', data.challengeTotalPoints.toFixed(1)],
    ['Badges awarded', data.badgesAwarded],
  ];
  for (const [label, value] of rows) doc.text(`${label}: ${value}`);
  if (data.inactiveParticipants.length) {
    doc.moveDown(1);
    doc.fontSize(14).text('Inactive Participants (3+ days)');
    doc.fontSize(10);
    for (const p of data.inactiveParticipants) {
      doc.text(`${p.first_name} ${p.last_name} (${p.email}) — last submission: ${p.last_submission || 'never'}`);
    }
  }
  return pdfToBuffer(doc);
}

export async function renderParticipantImpactPdf(data) {
  const doc = new PDFDocument({ margin: 50 });
  doc.fontSize(20).text('Inspire Daily — Participant Impact Report');
  doc.fontSize(12).fillColor('#666').text(`${data.user.first_name} ${data.user.last_name} — ${data.user.email}`);
  doc.fontSize(10).text(`Generated ${new Date(data.generatedAt).toLocaleString()} — ${data.periodLabel} (${data.period.start} to ${data.period.end})`);
  doc.moveDown(1.5);
  doc.fillColor('#000').fontSize(12);
  for (const line of participantNarrative(data)) {
    doc.text(`•  ${line}`, { paragraphGap: 6 });
  }
  doc.moveDown(1);
  doc.fontSize(14).text('Supporting Metrics');
  doc.fontSize(11);
  doc.text(`Daily Score submissions in period: ${data.dailyScoreSubmissions}`);
  doc.text(`Current streak: ${data.streakCount} days`);
  doc.text(`Goals — active: ${data.goals.active}, completed: ${data.goals.completed}, books completed: ${data.goals.readingBooksCompleted}`);
  doc.text(`Tasks completed: ${data.tasks.completed} (${data.tasks.hours.toFixed(1)} hours)`);
  doc.text(`Volunteer hours (all-time): ${data.volunteerHours.toFixed(1)}`);
  doc.text(`Inspire Challenge: ${data.challenge.currentPeriodPoints.toFixed(1)} points this Challenge period (${data.challenge.allTimePoints.toFixed(1)} all-time across ${data.challenge.allTimeDaysLogged} days)`);
  doc.text(`Badges: ${data.badges.length ? data.badges.map((b) => b.name).join(', ') : 'none yet'}`);
  return pdfToBuffer(doc);
}

// ─── CSV / XLSX exports ─────────────────────────────────────────────────────

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvEscape(c.value(r))).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

export async function rowsToXlsx(rows, columns, sheetName = 'Export') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.label, key: c.label, width: 22 }));
  for (const r of rows) sheet.addRow(Object.fromEntries(columns.map((c) => [c.label, c.value(r)])));
  sheet.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
}

const EXPORT_COLUMNS = {
  dailyScores: [
    { label: 'First Name', value: (r) => r.firstName },
    { label: 'Last Name', value: (r) => r.lastName },
    { label: 'Submitted Today', value: (r) => (r.submittedToday ? 'Yes' : 'No') },
    { label: 'Current Streak', value: (r) => r.streakCount },
    { label: 'Last Submission', value: (r) => r.lastSubmission || '' },
    { label: '7-day Completion', value: (r) => pct(r.completion7d) },
    { label: '30-day Completion', value: (r) => pct(r.completion30d) },
  ],
  goals: [
    { label: 'First Name', value: (r) => r.firstName },
    { label: 'Last Name', value: (r) => r.lastName },
    { label: 'Active Goals', value: (r) => r.activeGoals },
    { label: 'Completed Goals', value: (r) => r.completedGoals },
    { label: 'Completion Rate', value: (r) => pct(r.completionRate) },
    { label: 'Last Goal Activity', value: (r) => (r.lastGoalActivity ? new Date(r.lastGoalActivity).toISOString() : '') },
  ],
  tasks: [
    { label: 'First Name', value: (r) => r.firstName },
    { label: 'Last Name', value: (r) => r.lastName },
    { label: 'Role', value: (r) => r.appRole },
    { label: 'Total Signups', value: (r) => r.total },
    { label: 'In Progress', value: (r) => r.inProgress },
    { label: 'Completed', value: (r) => r.completed },
    { label: 'Hours', value: (r) => r.hours },
  ],
  volunteerHours: [
    { label: 'First Name', value: (r) => r.firstName },
    { label: 'Last Name', value: (r) => r.lastName },
    { label: 'Total Hours', value: (r) => r.totalHours },
    { label: 'This Month', value: (r) => r.monthHours },
    { label: 'Last Activity', value: (r) => r.lastActivity || '' },
  ],
  challenge: [
    { label: 'Rank', value: (r) => r.rank },
    { label: 'First Name', value: (r) => r.firstName },
    { label: 'Last Name', value: (r) => r.lastName },
    { label: 'Total Points', value: (r) => r.totalPoints },
    { label: 'Days Logged', value: (r) => r.daysLogged },
    { label: 'Avg Points/Day', value: (r) => r.avgPointsPerDay.toFixed(2) },
    { label: 'Last Activity', value: (r) => r.lastActivity || '' },
  ],
  inactive: [
    { label: 'First Name', value: (r) => r.first_name },
    { label: 'Last Name', value: (r) => r.last_name },
    { label: 'Email', value: (r) => r.email },
    { label: 'Last Submission', value: (r) => r.last_submission || 'Never' },
  ],
};

const LARGE_PAGE = 10000; // small program — one page covers every participant for exports

/** Returns { rows, columns } for a given export type, ready for CSV/XLSX. */
export async function getExportData(type) {
  switch (type) {
    case 'dailyScores':
      return { rows: (await listDailyScoresMembers({ pageSize: LARGE_PAGE })).rows, columns: EXPORT_COLUMNS.dailyScores };
    case 'goals':
      return { rows: (await listGoalsMembers({ pageSize: LARGE_PAGE })).rows, columns: EXPORT_COLUMNS.goals };
    case 'tasks':
      return { rows: (await listTasksMembers({ pageSize: LARGE_PAGE })).rows, columns: EXPORT_COLUMNS.tasks };
    case 'volunteerHours':
      return { rows: (await listVolunteerHoursMembers({ pageSize: LARGE_PAGE })).rows, columns: EXPORT_COLUMNS.volunteerHours };
    case 'challenge':
      return { rows: (await listChallengeMembers({ pageSize: LARGE_PAGE })).rows, columns: EXPORT_COLUMNS.challenge };
    case 'inactive': {
      const { rows } = await query(
        `select u.first_name, u.last_name, u.email,
                (select max(ds.date) from daily_scores ds where ds.user_id = u.id) as last_submission
           from users u
          where u.system_role = 'participant' and u.account_status = 'approved'
            and not exists (select 1 from daily_scores ds where ds.user_id = u.id and ds.date >= $1::date - make_interval(days => $2))
          order by last_submission asc nulls first`,
        [ptDateString(), ATTENTION_NO_SUBMISSION_DAYS]
      );
      return { rows, columns: EXPORT_COLUMNS.inactive };
    }
    default:
      return null;
  }
}
