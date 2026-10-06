/**
 * THE canonical Tier calculation (Tier Lab, pre-launch shadow mode).
 *
 * Pure and deterministic: no database, no clock, no randomness — same inputs,
 * same output. Thresholds come ONLY from a rule set (config/tierRules.js);
 * nothing here hardcodes a tier requirement. Not an LLM, not a heuristic.
 *
 * Two measurements, both required for a tier:
 *   ENTRY COMPLETION RATE  = completed required entries / eligible required days
 *   CHALLENGE AVERAGE      = Challenge points / eligible required days
 *                            (a day with no Challenge entry counts as 0 — the
 *                            denominator is DAYS, never "days with an entry")
 *
 * "Eligible required day" = a non-Sunday day (the program's own Sunday rule,
 * via config/pacificTime.js) between the participant's eligibility start and
 * the reporting boundary (the latest day whose submission window has CLOSED —
 * see `reportingBoundary`). Sundays, future days, today, and a still-open
 * catch-up day are never counted as misses.
 *
 * A completed entry is a Daily Score row for that day — nothing else. A
 * streak shield protects a streak; it is never an input here and never turns
 * a missed day into a completed one. Daily Score answers are never read.
 *
 * Honesty about history: for days on/before a participant's historical-era
 * end (Base44 import cutoff / their own Base44 checkpoint), a MISSING record
 * cannot prove a miss, so such days are "unverifiable" and excluded from the
 * denominators (never counted as completed, never as missed). Each MEASURE
 * is judged separately per month: if too many of a month's days are
 * unverifiable for that measure, that measure is left out of the month
 * ("insufficient_history" when both are) — a checkpoint that covers the
 * Challenge days but not the Daily Score days still lets Challenge count.
 *
 * Six-month results use the underlying opportunities (sums), NOT an average
 * of monthly percentages, so months weigh by their real number of days.
 */
import { addDays, ptDayOfWeek } from '../config/pacificTime.js';
import { isDeadlineClosed } from './streakEngine.js';

export const TIER_LABELS = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };
export const BUILDING_LABEL = 'Building Toward Tier 3';
export const INSUFFICIENT_LABEL = 'Insufficient Data';

/** Projected-tier display label for a tier number / status. */
export function projectedLabel(tier, status = 'ok') {
  if (status === 'insufficient') return INSUFFICIENT_LABEL;
  return tier ? `Projected ${TIER_LABELS[tier]}` : BUILDING_LABEL;
}

/** Latest date whose submission window has closed (noon PT the next day).
 * Everything after it — today, a still-open yesterday — is not yet countable. */
export function reportingBoundary({ today, beforeNoon }) {
  let d = today;
  for (let i = 0; i < 10 && !isDeadlineClosed(d, today, beforeNoon); i++) d = addDays(d, -1);
  return d;
}

/** Non-Sunday dates in [start, end] inclusive. */
export function requiredDays(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (ptDayOfWeek(d) !== 0) out.push(d);
  return out;
}

export function monthStartOf(month) { return `${month}-01`; }
export function monthEndOf(month) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
/** The `count` calendar months ending at `endMonth` (inclusive), oldest first. */
export function monthsEndingAt(endMonth, count) {
  const [y, m] = endMonth.split('-').map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Best (lowest-numbered) tier whose single requirement `value` satisfies. */
function bestTierFor(rules, field, value) {
  if (value == null) return null;
  const hit = rules.tiers.find((t) => value >= t[field]);
  return hit ? hit.tier : null;
}

/**
 * Tier + deterministic explanation. Both requirements must hold; tiers are
 * tried best-first. Comparison is exact (>=) on unrounded values, so 89.99%
 * is never rounded up into Tier 1.
 */
export function classifyTier(rules, completionRate, challengeAverage) {
  if (completionRate == null || challengeAverage == null) {
    return { tier: null, completionTier: null, challengeTier: null, lines: [], summary: 'Not enough data to classify.' };
  }
  const tier = rules.tiers.find((t) => completionRate >= t.minCompletion && challengeAverage >= t.minChallengeAvg)?.tier ?? null;
  const completionTier = bestTierFor(rules, 'minCompletion', completionRate);
  const challengeTier = bestTierFor(rules, 'minChallengeAvg', challengeAverage);

  // What stands between this participant and the next tier up (or Tier 3).
  const target = rules.tiers.find((t) => t.tier === (tier ? tier - 1 : rules.tiers[rules.tiers.length - 1].tier));
  const lines = [];
  if (target) {
    lines.push({
      metric: 'completion', actual: completionRate, required: target.minCompletion,
      targetTier: target.tier, met: completionRate >= target.minCompletion,
    });
    lines.push({
      metric: 'challengeAverage', actual: challengeAverage, required: target.minChallengeAvg,
      targetTier: target.tier, met: challengeAverage >= target.minChallengeAvg,
    });
  }
  const lowestTier = rules.tiers[rules.tiers.length - 1].tier;
  const meets = (n) => (n ? `meets ${TIER_LABELS[n]}` : `is below ${TIER_LABELS[lowestTier]}`);
  let summary;
  if (tier === 1) {
    summary = 'Both Tier 1 requirements are currently satisfied.';
  } else {
    summary = `Completion ${meets(completionTier)}; Challenge average ${meets(challengeTier)}.`;
    if (completionTier !== challengeTier) {
      const limiter = (completionTier ?? 99) > (challengeTier ?? 99) ? 'completion' : 'Challenge average';
      summary += ` Limited by ${limiter}.`;
    }
  }
  return { tier, completionTier, challengeTier, lines, summary };
}

/**
 * @param {object} p
 * @param {object} p.rules           - a rule set (config/tierRules.js)
 * @param {object} p.participant     - { id, name, eligibleStart, historicalEraEnd|null, hasAnyActivity,
 *                                       completedDates:Set|string[], challengeRowDates:Set|string[],
 *                                       challengeCheckpoint:{period,checkpointDate}|null }
 * @param {string[]} p.months        - 'YYYY-MM' months to evaluate (oldest first)
 * @param {string} p.evalEnd         - reporting boundary ('YYYY-MM-DD'); nothing after it is counted
 * @param {string} p.challengeProgramStart - first day the Challenge existed (no Challenge denominators before it)
 * @param {Record<string, number>} p.challengePointsByMonth - checkpoint-aware, Sunday-excluded points (<= evalEnd)
 */
export function evaluateParticipant({ rules, participant, months, evalEnd, challengeProgramStart, challengePointsByMonth }) {
  const completed = participant.completedDates instanceof Set ? participant.completedDates : new Set(participant.completedDates);
  const challengeRows = participant.challengeRowDates instanceof Set ? participant.challengeRowDates : new Set(participant.challengeRowDates);
  const eraEnd = participant.historicalEraEnd || null;
  const cp = participant.challengeCheckpoint || null;

  const monthlyBreakdown = months.map((month) => {
    const monthStart = monthStartOf(month);
    const monthEnd = monthEndOf(month);
    const spanStart = participant.eligibleStart > monthStart ? participant.eligibleStart : monthStart;
    const spanEnd = evalEnd < monthEnd ? evalEnd : monthEnd;
    const base = { month, inProgress: evalEnd < monthEnd };
    const days = spanStart <= spanEnd ? requiredDays(spanStart, spanEnd) : [];
    if (days.length === 0) {
      return { ...base, status: 'not_eligible', completionStatus: 'n/a', challengeStatus: 'n/a', completionUsable: false, challengeUsable: false, eligibleDays: 0, completedEntries: 0, missedDays: 0, unverifiableDays: 0,
        completionDenominator: 0, completionRate: null, completionRateWorstCase: null, challengePoints: 0, challengeDays: 0,
        challengeDaysAll: 0, challengeUnverifiableDays: 0, challengeAverage: null, challengeAverageWorstCase: null,
        projectedTier: null, usable: false };
    }

    let completedEntries = 0, unverifiable = 0, missed = 0;
    for (const d of days) {
      if (completed.has(d)) completedEntries += 1;
      else if (eraEnd && d <= eraEnd) unverifiable += 1;
      else missed += 1;
    }
    const completionDenominator = days.length - unverifiable;

    const cStart = spanStart > challengeProgramStart ? spanStart : challengeProgramStart;
    const cdays = cStart <= spanEnd ? requiredDays(cStart, spanEnd) : [];
    let chUnverifiable = 0;
    for (const d of cdays) {
      const coveredByAggregate = cp && cp.period === month && d <= cp.checkpointDate;
      if (!challengeRows.has(d) && !coveredByAggregate && eraEnd && d <= eraEnd) chUnverifiable += 1;
    }
    const challengeDenominator = cdays.length - chUnverifiable;
    const challengePoints = Number(challengePointsByMonth?.[month] || 0);

    const cShare = unverifiable / days.length;
    const chShare = cdays.length ? chUnverifiable / cdays.length : 0;
    const completionUsable = cShare <= rules.maxUnverifiableShare;
    const challengeUsable = cdays.length > 0 && chShare <= rules.maxUnverifiableShare;
    const measureStatus = (usable, unv) => (!usable ? 'excluded' : unv > 0 ? 'partial' : 'complete');
    const completionStatus = measureStatus(completionUsable, unverifiable);
    const challengeStatus = cdays.length === 0 ? 'n/a' : measureStatus(challengeUsable, chUnverifiable);
    const status = completionStatus === 'excluded' && challengeStatus !== 'complete' && challengeStatus !== 'partial' ? 'insufficient_history'
      : completionStatus === 'excluded' || challengeStatus === 'excluded' ? 'partial_history'
      : completionStatus === 'partial' || challengeStatus === 'partial' ? 'partial' : 'complete';

    const completionRate = completionUsable && completionDenominator > 0 ? completedEntries / completionDenominator : null;
    const challengeAverage = challengeUsable && challengeDenominator > 0 ? challengePoints / challengeDenominator : null;
    const monthTier = classifyTier(rules, completionRate, challengeAverage);

    return {
      ...base, status, completionStatus, challengeStatus,
      usable: completionUsable || challengeUsable, completionUsable, challengeUsable,
      eligibleDays: days.length, completedEntries, missedDays: missed, unverifiableDays: unverifiable,
      completionDenominator, completionRate,
      completionRateWorstCase: completionUsable && days.length > 0 ? completedEntries / days.length : null,
      challengePoints, challengeDays: challengeDenominator, challengeDaysAll: cdays.length,
      challengeUnverifiableDays: chUnverifiable, challengeAverage,
      challengeAverageWorstCase: challengeUsable && cdays.length > 0 ? challengePoints / cdays.length : null,
      projectedTier: monthTier.tier,
      monthTierComputable: completionRate != null && challengeAverage != null,
    };
  });

  // ── Combined window: sums of underlying opportunities, per measure, over the
  // months where that measure is usable.
  const sum = (arr, k) => arr.reduce((t, m) => t + m[k], 0);
  const cMonths = monthlyBreakdown.filter((m) => m.completionUsable);
  const hMonths = monthlyBreakdown.filter((m) => m.challengeUsable);
  const completedEntries = sum(cMonths, 'completedEntries');
  const eligibleDays = sum(cMonths, 'completionDenominator');
  const challengePoints = sum(hMonths, 'challengePoints');
  const challengeDays = sum(hMonths, 'challengeDays');
  const completionRate = eligibleDays > 0 ? completedEntries / eligibleDays : null;
  const challengeAverage = challengeDays > 0 ? challengePoints / challengeDays : null;
  // Worst case: every unverifiable day treated as a miss / zero-point day.
  const allDays = sum(cMonths, 'eligibleDays');
  const allChallengeDays = sum(hMonths, 'challengeDaysAll');
  const worstCompletion = allDays > 0 ? completedEntries / allDays : null;
  const worstAverage = allChallengeDays > 0 ? challengePoints / allChallengeDays : null;

  const caveats = [];
  const exclC = monthlyBreakdown.filter((m) => m.completionStatus === 'excluded').map((m) => m.month);
  const exclH = monthlyBreakdown.filter((m) => m.challengeStatus === 'excluded').map((m) => m.month);
  if (exclC.length) caveats.push(`Completion excludes ${exclC.length} month(s) with insufficient historical detail: ${exclC.join(', ')}.`);
  if (exclH.length) caveats.push(`Challenge average excludes ${exclH.length} month(s) with insufficient historical detail: ${exclH.join(', ')}.`);
  const partial = monthlyBreakdown.filter((m) => m.completionStatus === 'partial' || m.challengeStatus === 'partial');
  if (partial.length) {
    const n = sum(partial.filter((m) => m.completionStatus === 'partial'), 'unverifiableDays')
      + sum(partial.filter((m) => m.challengeStatus === 'partial'), 'challengeUnverifiableDays');
    caveats.push(`${n} unverifiable historical day(s) left out of the denominators in: ${partial.map((m) => m.month).join(', ')}.`);
  }
  if (monthlyBreakdown.some((m) => m.inProgress && m.eligibleDays > 0)) caveats.push('Current month is in progress — only days whose submission window has closed are counted.');

  let status = 'ok';
  let insufficientReason = null;
  if (!participant.hasAnyActivity) { status = 'insufficient'; insufficientReason = 'No Daily Score or Challenge activity recorded yet.'; }
  else if (eligibleDays < rules.minEligibleDays) {
    status = 'insufficient';
    insufficientReason = cMonths.length === 0
      ? 'No month has enough verifiable historical detail to evaluate.'
      : `Only ${eligibleDays} verifiable eligible day(s) of completion data; ${rules.minEligibleDays} needed.`;
  } else if (challengeDays < rules.minEligibleDays) {
    status = 'insufficient';
    insufficientReason = `Only ${challengeDays} verifiable eligible day(s) of Challenge data; ${rules.minEligibleDays} needed.`;
  }

  const verdict = status === 'ok' ? classifyTier(rules, completionRate, challengeAverage) : null;
  const projectedTier = verdict ? verdict.tier : null;
  const worstVerdict = status === 'ok' ? classifyTier(rules, worstCompletion, worstAverage) : null;
  // Uncertain = the tier would be different if the unverifiable days were all misses.
  const uncertain = Boolean(verdict && worstVerdict && worstVerdict.tier !== verdict.tier);
  const dataStatus = status === 'insufficient' ? 'insufficient' : caveats.some((c) => !c.startsWith('Current month')) ? 'partial' : 'complete';

  // Trend: only when the last two usable months each have enough days to mean something.
  const trendMonths = cMonths.filter((m) => m.completionDenominator >= rules.trend.minDays && m.completionRate != null).slice(-2);
  let completionTrend = null;
  if (trendMonths.length === 2) {
    const diff = trendMonths[1].completionRate - trendMonths[0].completionRate;
    completionTrend = {
      direction: diff >= rules.trend.delta ? 'improving' : diff <= -rules.trend.delta ? 'declining' : 'steady',
      fromMonth: trendMonths[0].month, toMonth: trendMonths[1].month,
      from: trendMonths[0].completionRate, to: trendMonths[1].completionRate,
    };
  }

  const usedMonths = monthlyBreakdown.filter((m) => m.usable);
  const evaluationStart = usedMonths.length ? (participant.eligibleStart > monthStartOf(usedMonths[0].month) ? participant.eligibleStart : monthStartOf(usedMonths[0].month)) : null;

  return {
    ruleVersion: rules.version,
    ruleStatus: rules.status,
    participantId: participant.id,
    evaluationStart,
    evaluationEnd: evalEnd,
    eligibleStart: participant.eligibleStart,
    eligibleDays,
    completedEntries,
    completionRate,
    challengeDays,
    challengePoints,
    challengeAverage,
    worstCase: {
      completionRate: worstCompletion,
      challengeAverage: worstAverage,
      projectedTier: worstVerdict ? worstVerdict.tier : null,
    },
    uncertain,
    usableMonths: cMonths.filter((m) => m.completionDenominator > 0).length,
    projectedTier,
    projectedLabel: projectedLabel(projectedTier, status),
    status,
    insufficientReason,
    explanation: verdict ? { summary: verdict.summary, lines: verdict.lines, completionTier: verdict.completionTier, challengeTier: verdict.challengeTier } : null,
    reasons: verdict ? [verdict.summary] : insufficientReason ? [insufficientReason] : [],
    dataStatus,
    caveats,
    completionTrend,
    monthlyBreakdown,
  };
}

/** Counts of projected results over a list of evaluateParticipant() outputs. */
export function distributionOf(results) {
  const d = { tier1: 0, tier2: 0, tier3: 0, building: 0, insufficient: 0, total: results.length };
  for (const r of results) {
    if (r.status === 'insufficient') d.insufficient += 1;
    else if (r.projectedTier === 1) d.tier1 += 1;
    else if (r.projectedTier === 2) d.tier2 += 1;
    else if (r.projectedTier === 3) d.tier3 += 1;
    else d.building += 1;
  }
  return d;
}
