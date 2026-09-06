/**
 * Daily Scores Summary Agent — staff/admin-only, read-only reporting.
 *
 * "Agent" here means a deterministic metrics pipeline, not a generative
 * model: every number is a real aggregate query, and the narrative sentences
 * are template-driven off those numbers, never invented. This keeps the
 * output grounded by construction (Inspire 2.2 Part 19) rather than relying
 * on a prompt to behave — there is no LLM call in this file to go off the
 * rails in the first place.
 *
 * Daily Scores' five 1-10 dimensions (Best Self, CEO Mindset, Grit,
 * Happiness, Sleep) are always presented as trend/reflection indicators —
 * averages and period-over-period deltas — never summed into a combined
 * score, never framed as "good day"/"bad day", never used to rank anyone
 * (Inspire 2.2 Parts 2 and 6).
 *
 * Every read here is a SELECT. Generating a report never writes to
 * daily_scores, summer_entries, goals, task_signups, badges, or users — the
 * only write in this feature is the report_summaries metadata row + PDF file
 * written by reportStorage.js, done by the route handler, not this module.
 */
import { query } from '../../db.js';
import { ptDateString, addDays, currentWeekBoundsPT } from '../../config/pacificTime.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../../config/constants.js';
import { eligibleDayCount, previousWeekBounds, previousMonthBounds } from '../../lib/reportingWindow.js';
import { resolveMonthBounds } from './challengeService.js';
import { getCheckpointForUser } from '../../repositories/base44Checkpoints.js';

const DIMENSIONS = [
  { key: 'best_self', label: 'Best Self' },
  { key: 'ceo_mindset', label: 'CEO Mindset' },
  { key: 'grit', label: 'Grit' },
  { key: 'happiness', label: 'Happiness' },
  { key: 'sleep', label: 'Sleep' },
];

// A delta smaller than this (on a 1-10 scale) is treated as "held steady"
// rather than a meaningful trend worth calling out — an explicit, documented
// threshold, not a fuzzy inference.
const NOTABLE_DIMENSION_DELTA = 0.75;
const NOTABLE_PARTICIPATION_DELTA_PCT = 10;

function round1(n) {
  return Math.round(n * 10) / 10;
}

function avgOrNull(values) {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function pctOrNull(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Numeric delta + percent-delta-or-"Not enough data" + direction, for one
 * dimension or one participation rate, comparing current vs. prior period. */
function deltaSummary(current, prior) {
  if (current == null) return { current, prior, delta: null, percentDelta: null, direction: 'insufficient_data' };
  if (prior == null || prior === 0) {
    return { current: round1(current), prior: prior == null ? null : round1(prior), delta: null, percentDelta: 'Not enough data', direction: 'insufficient_data' };
  }
  const delta = current - prior;
  return {
    current: round1(current),
    prior: round1(prior),
    delta: round1(delta),
    percentDelta: round1((delta / prior) * 100),
    direction: Math.abs(delta) < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down',
  };
}

async function fetchUser(userId) {
  const { rows } = await query(
    `select id, first_name, last_name, app_role, streak_count, streak_shields, created_at
       from users where id = $1 and system_role = 'participant'`,
    [userId]
  );
  return rows[0] || null;
}

async function fetchDailyScores(userId, start, end) {
  const { rows } = await query(
    `select date, best_self, ceo_mindset, grit, happiness, sleep, volunteer_hours
       from daily_scores where user_id = $1 and date between $2 and $3 order by date asc`,
    [userId, start, end]
  );
  return rows;
}

/**
 * A Base44 checkpoint is a whole-month cumulative figure — it has no daily
 * breakdown to attribute to a partial week. Applying it here would mean
 * guessing which days of a 7-day window it "belongs to", which is exactly
 * the kind of fabrication this whole feature must never do. So the
 * checkpoint is only ever applied when `[start, end]` is the FULL calendar
 * month it was recorded for (i.e. monthly reports) — a weekly report's
 * Challenge stats are always real data only, checkpoint or not.
 */
async function fetchChallengeStats(userId, start, end, checkpoint = null) {
  const periodKey = start.slice(0, 7);
  const isFullMonthMatch = Boolean(
    checkpoint && checkpoint.challenge_period === periodKey && start === resolveMonthBounds(periodKey).start && end === resolveMonthBounds(periodKey).end
  );
  const cpDateBound = isFullMonthMatch ? checkpoint.checkpoint_date : '1899-12-31';
  const { rows } = await query(
    `select count(distinct date)::int as days_logged, coalesce(sum(total_points), 0)::numeric as points
       from summer_entries where user_id = $1 and date between $2 and $3 and date > $4::date`,
    [userId, start, end, cpDateBound]
  );
  const daysLogged = rows[0].days_logged + (isFullMonthMatch ? checkpoint.challenge_days_checkpoint : 0);
  const points = Number(rows[0].points) + (isFullMonthMatch ? Number(checkpoint.challenge_points_checkpoint) : 0);
  return { daysLogged, points, checkpointApplied: isFullMonthMatch };
}

async function fetchGoals(userId, periodStart, periodEnd) {
  const { rows } = await query(
    `select completed, completed_date from goals where user_id = $1`,
    [userId]
  );
  const active = rows.filter((g) => !g.completed).length;
  const completedInPeriod = rows.filter((g) => g.completed && g.completed_date >= periodStart && g.completed_date <= periodEnd).length;
  // Progress % = of the goals touched this period (still-active + newly
  // completed), how many reached completion — a period snapshot, not a
  // lifetime rate, and undefined (not zero) when nothing was in play.
  const inPlay = active + completedInPeriod;
  return { active, completedInPeriod, progressPct: pctOrNull(completedInPeriod, inPlay) };
}

async function fetchTasksCompleted(userId, periodStart, periodEnd) {
  const { rows } = await query(
    `select count(*)::int as count from task_signups
      where user_id = $1 and status = 'completed' and completed_date between $2 and $3`,
    [userId, periodStart, periodEnd]
  );
  return rows[0].count;
}

async function fetchBadgesEarned(userId, periodStart, periodEnd) {
  const { rows } = await query(
    `select name, badge_type, earned_date from badges
      where user_id = $1 and earned_date between $2 and $3 order by earned_date asc`,
    [userId, periodStart, periodEnd]
  );
  return rows;
}

function sumVolunteerHours(dailyScoreRows) {
  return round1(dailyScoreRows.reduce((s, r) => s + Number(r.volunteer_hours || 0), 0));
}

function dimensionTrends(currentRows, priorRows) {
  return DIMENSIONS.map((d) => {
    const currentAvg = avgOrNull(currentRows.map((r) => Number(r[d.key])));
    const priorAvg = avgOrNull(priorRows.map((r) => Number(r[d.key])));
    return { key: d.key, label: d.label, ...deltaSummary(currentAvg, priorAvg) };
  });
}

/** Objective, factual sentences only — never "good day"/"bad day", never a
 * judgment about the person. Every sentence traces to a computed number
 * above it; nothing here is generated freeform. */
function buildNarrative({ user, participation, priorParticipation, dimensions, goals, tasksCompleted, volunteerHours, challenge, streakCount }) {
  const highlights = [];
  const needsAttention = [];
  const focus = [];

  // Participation
  if (participation.pct != null && priorParticipation.pct != null) {
    const delta = participation.pct - priorParticipation.pct;
    if (delta >= NOTABLE_PARTICIPATION_DELTA_PCT) highlights.push(`Daily Score participation increased from ${priorParticipation.pct}% to ${participation.pct}%.`);
    else if (delta <= -NOTABLE_PARTICIPATION_DELTA_PCT) needsAttention.push(`Daily Score participation decreased from ${priorParticipation.pct}% to ${participation.pct}%.`);
  }
  if (participation.pct != null && participation.pct < 100) {
    focus.push('Continue building consistency with daily reflection submissions.');
  }

  // Dimension trends
  const trendingUp = dimensions.filter((d) => d.direction === 'up' && Math.abs(d.delta) >= NOTABLE_DIMENSION_DELTA);
  const trendingDown = dimensions.filter((d) => d.direction === 'down' && Math.abs(d.delta) >= NOTABLE_DIMENSION_DELTA);
  for (const d of trendingUp) highlights.push(`${d.label} trended higher across the reporting period (${d.prior} → ${d.current}).`);
  for (const d of trendingDown) {
    needsAttention.push(`${d.label} trended lower across the reporting period (${d.prior} → ${d.current}).`);
    focus.push(`${d.label} may be worth revisiting in the next period.`);
  }
  if (!trendingUp.length && !trendingDown.length && dimensions.some((d) => d.direction !== 'insufficient_data')) {
    highlights.push('Reflection dimensions remained fairly consistent across the reporting period.');
  }

  // Goals / tasks / volunteer hours
  if (goals.completedInPeriod > 0) highlights.push(`${goals.completedInPeriod} goal(s) were completed this period.`);
  else if (goals.active > 0) focus.push('Goal activity remained available but no goals were completed this period.');
  if (tasksCompleted > 0) highlights.push(`${tasksCompleted} internship task(s) were completed this period.`);
  if (volunteerHours > 0) highlights.push(`${volunteerHours} volunteer hour(s) were logged this period.`);
  if (challenge.daysLogged === 0 && participation.eligibleDays > 0) {
    needsAttention.push('No Inspire Challenge entries were logged this period.');
  }

  // Trim to the requested 2-3 / 1-3 counts, most-factual-first (order of
  // computation above already prioritizes participation/dimension trends).
  const highlightsFinal = highlights.slice(0, 3);
  const needsAttentionFinal = needsAttention.slice(0, 3);
  const focusFinal = [...new Set(focus)].slice(0, 3);
  if (focusFinal.length === 0) focusFinal.push('Maintain current habits into the next period.');

  const summaryLines = [];
  summaryLines.push(
    `${user.first_name} ${user.last_name} submitted ${participation.submitted} of ${participation.eligibleDays} eligible Daily Scores this period (${participation.pct == null ? 'not enough data' : participation.pct + '%'}), with a current streak of ${streakCount} day(s).`
  );
  if (trendingUp.length || trendingDown.length) {
    const parts = [...trendingUp.map((d) => `${d.label} up`), ...trendingDown.map((d) => `${d.label} down`)];
    summaryLines.push(`Reflection trends: ${parts.join(', ')} compared with the prior period.`);
  } else {
    summaryLines.push('Reflection dimensions held steady compared with the prior period.');
  }
  summaryLines.push(`Inspire Challenge: ${challenge.daysLogged} day(s) logged this period, ${challenge.points} canonical point(s).`);

  return {
    highlights: highlightsFinal.length ? highlightsFinal : ['Not enough data to identify a clear positive pattern this period.'],
    needsAttention: needsAttentionFinal.length ? needsAttentionFinal : ['No notable declines identified this period.'],
    nextPeriodFocus: focusFinal,
    summary: summaryLines.join(' '),
  };
}

async function buildSummaryForPeriod(userId, { start, end, priorStart, priorEnd, reportType, periodLabel }) {
  const user = await fetchUser(userId);
  if (!user) return null;
  const today = ptDateString();
  // Challenge didn't exist before its launch date — clamp the window's start
  // so a report covering an earlier period never treats pre-launch days as
  // "eligible but missed." ISO 'YYYY-MM-DD' strings compare correctly with
  // plain string comparison; Math.max() would coerce them to NaN.
  const challengeWindowStart = start < SUMMER_CHALLENGE_LAUNCH_DATE ? SUMMER_CHALLENGE_LAUNCH_DATE : start;
  // fetchChallengeStats reads the raw base44_checkpoints row shape directly
  // (challenge_period / checkpoint_date / challenge_days_checkpoint /
  // challenge_points_checkpoint) — no remapping needed.
  const checkpoint = await getCheckpointForUser(userId);

  const [currentRows, priorRows, challenge, goals, tasksCompleted, badges] = await Promise.all([
    fetchDailyScores(userId, start, end),
    fetchDailyScores(userId, priorStart, priorEnd),
    challengeWindowStart > end ? Promise.resolve({ daysLogged: 0, points: 0 }) : fetchChallengeStats(userId, challengeWindowStart, end, checkpoint),
    fetchGoals(userId, start, end),
    fetchTasksCompleted(userId, start, end),
    fetchBadgesEarned(userId, start, end),
  ]);

  const eligibleDays = eligibleDayCount(start, end, today);
  const priorEligibleDays = eligibleDayCount(priorStart, priorEnd, today);
  const participation = { submitted: currentRows.length, eligibleDays, pct: pctOrNull(currentRows.length, eligibleDays) };
  const priorParticipation = { submitted: priorRows.length, eligibleDays: priorEligibleDays, pct: pctOrNull(priorRows.length, priorEligibleDays) };

  const challengeEligibleDays = challengeWindowStart > end ? 0 : eligibleDayCount(challengeWindowStart, end, today);
  const challengePct = pctOrNull(challenge.daysLogged, challengeEligibleDays);

  const dimensions = dimensionTrends(currentRows, priorRows);
  const volunteerHours = sumVolunteerHours(currentRows);

  const narrative = buildNarrative({
    user, participation, priorParticipation, dimensions, goals, tasksCompleted, volunteerHours, challenge, streakCount: user.streak_count,
  });

  return {
    reportType,
    user: { id: user.id, firstName: user.first_name, lastName: user.last_name, appRole: user.app_role },
    periodLabel,
    period: { start, end },
    priorPeriod: { start: priorStart, end: priorEnd },
    generatedAt: new Date().toISOString(),
    streakCount: user.streak_count,
    streakShields: user.streak_shields,
    participation: { ...participation, priorPct: priorParticipation.pct },
    challenge: { ...challenge, eligibleDays: challengeEligibleDays, pct: challengePct },
    goals,
    tasksCompleted,
    volunteerHours,
    badges: badges.map((b) => ({ name: b.name, type: b.badge_type, earnedDate: b.earned_date })),
    dimensions,
    highlights: narrative.highlights,
    needsAttention: narrative.needsAttention,
    nextPeriodFocus: narrative.nextPeriodFocus,
    summary: narrative.summary,
  };
}

/** Weekly summary — defaults to the current Mon-Sun week; pass `weekStart`
 * ('YYYY-MM-DD', a Monday) to generate for a prior week instead. */
export async function buildWeeklySummary(userId, weekStart) {
  const start = weekStart || currentWeekBoundsPT().start;
  const end = addDays(start, 6);
  const { start: priorStart, end: priorEnd } = previousWeekBounds(start);
  return buildSummaryForPeriod(userId, {
    start, end, priorStart, priorEnd, reportType: 'weekly',
    periodLabel: `Week of ${start} to ${end}`,
  });
}

/** Monthly summary — defaults to the current calendar month; pass `month`
 * ('YYYY-MM') to generate for a prior month instead. */
export async function buildMonthlySummary(userId, month) {
  const { start, end } = resolveMonthBounds(month);
  const { start: priorStart, end: priorEnd } = previousMonthBounds(start);
  return buildSummaryForPeriod(userId, {
    start, end, priorStart, priorEnd, reportType: 'monthly',
    periodLabel: `${start.slice(0, 7)}`,
  });
}

export { DIMENSIONS };
