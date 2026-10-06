/**
 * Tier Lab data service (HQ-only, pre-launch shadow mode). Loads canonical
 * source data READ-ONLY and hands it to the one tier engine (lib/tierEngine.js).
 * It never writes anything: no tier awards, no snapshots, no participant
 * activity, no streak/shield state.
 *
 * Sources (nothing is duplicated into new tables):
 *   - Completed entries ........ daily_scores rows (a row = a completed required entry)
 *   - Challenge points ......... getMonthlyChallengeBreakdown (the same checkpoint-aware,
 *                                month-scoped resolver HQ Challenge/Snapshot use), Sundays excluded
 *   - Eligibility start ........ earliest of: first Daily Score, first Challenge entry, account
 *                                creation date (PT) — i.e. the first moment the person was
 *                                either participating or enrolled
 *   - Historical-era end ....... max(HISTORICAL_IMPORT_CUTOFF, own Base44 checkpoint date) when
 *                                the participant's eligibility predates the live app
 *   - Reporting boundary ....... latest day whose submission window has closed (noon PT next day)
 */
import { query } from '../../db.js';
import { ptDateString } from '../../config/pacificTime.js';
import { clockFrom } from '../../lib/streakEngine.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../../config/constants.js';
import {
  getRuleSet, CURRENT_DRAFT_VERSION, TIER_LAB_META, HISTORICAL_IMPORT_CUTOFF,
} from '../../config/tierRules.js';
import {
  evaluateParticipant, distributionOf, reportingBoundary, monthsEndingAt, monthStartOf, monthEndOf,
} from '../../lib/tierEngine.js';
import { getAllCheckpoints } from '../../repositories/base44Checkpoints.js';
import { getMonthlyChallengeBreakdown } from './challengeService.js';

const MONTH_RE = /^\d{4}-\d{2}$/;

/** What the UI shows for a rule set (never includes anything participant-facing). */
export function publicRules(rules) {
  return {
    version: rules.version, label: rules.label, status: rules.status,
    participantVisible: rules.participantVisible, effectiveForOfficialAwards: rules.effectiveForOfficialAwards,
    windowMonths: rules.windowMonths, minEligibleDays: rules.minEligibleDays, maxUnverifiableShare: rules.maxUnverifiableShare,
    trend: rules.trend,
    tiers: rules.tiers.map((t) => ({ tier: t.tier, minCompletion: t.minCompletion, minChallengeAvg: t.minChallengeAvg })),
  };
}

/** Everything the engine needs for the given participants, in one pass. `userIds`
 * null = every approved participant. Pure reads. */
export async function loadTierInputs({ userIds = null, endMonth, windowMonths = 6, now = new Date() } = {}) {
  const clock = clockFrom(now);
  const evalEndGlobal = reportingBoundary(clock);
  const thisMonth = clock.today.slice(0, 7);
  const end = endMonth && MONTH_RE.test(endMonth) && endMonth <= thisMonth ? endMonth : thisMonth;
  const months = monthsEndingAt(end, windowMonths);
  const evalEnd = monthEndOf(end) < evalEndGlobal ? monthEndOf(end) : evalEndGlobal;
  const windowStart = monthStartOf(months[0]);

  const { rows: users } = userIds
    ? await query(
        `select id, first_name, last_name, app_role, created_at from users where id = any($1::uuid[]) and system_role = 'participant'`,
        [userIds]
      )
    : await query(
        `select id, first_name, last_name, app_role, created_at from users
          where system_role = 'participant' and account_status = 'approved' order by first_name, last_name`
      );
  const ids = users.map((u) => u.id);

  const [dsAll, chAll, cps] = await Promise.all([
    query(`select user_id, date::text as d from daily_scores where user_id = any($1::uuid[]) and date <= $2`, [ids, evalEnd]),
    query(`select user_id, date::text as d from summer_entries where user_id = any($1::uuid[]) and date <= $2`, [ids, evalEnd]),
    getAllCheckpoints(),
  ]);
  // Earliest Challenge activity anywhere (Base44 launched it a day before the constant says).
  const { rows: [launch] } = await query(`select min(date)::text as d from summer_entries`);
  const challengeProgramStart = launch?.d && launch.d < SUMMER_CHALLENGE_LAUNCH_DATE ? launch.d : SUMMER_CHALLENGE_LAUNCH_DATE;

  // Canonical, checkpoint-aware Challenge points per participant per month (Sundays excluded).
  const pointsByUser = new Map();
  for (const month of months) {
    const mStart = monthStartOf(month);
    if (mStart > evalEnd) continue;
    const mEnd = monthEndOf(month) < evalEnd ? monthEndOf(month) : evalEnd;
    const rows = await getMonthlyChallengeBreakdown(mStart, mEnd, { excludeSundays: true });
    for (const r of rows) {
      if (!pointsByUser.has(r.userId)) pointsByUser.set(r.userId, {});
      pointsByUser.get(r.userId)[month] = r.points;
    }
  }

  const dsBy = new Map(); const chBy = new Map();
  for (const r of dsAll.rows) { if (!dsBy.has(r.user_id)) dsBy.set(r.user_id, new Set()); dsBy.get(r.user_id).add(r.d); }
  for (const r of chAll.rows) { if (!chBy.has(r.user_id)) chBy.set(r.user_id, new Set()); chBy.get(r.user_id).add(r.d); }

  const participants = users.map((u) => {
    const ds = dsBy.get(u.id) || new Set();
    const ch = chBy.get(u.id) || new Set();
    const cp = cps.get(u.id) || null;
    const createdPT = ptDateString(new Date(u.created_at));
    const eligibleStart = [createdPT, ...ds, ...ch].reduce((a, b) => (b < a ? b : a));
    const historicalEraEnd = cp
      ? (cp.checkpoint_date > HISTORICAL_IMPORT_CUTOFF ? cp.checkpoint_date : HISTORICAL_IMPORT_CUTOFF)
      : eligibleStart <= HISTORICAL_IMPORT_CUTOFF ? HISTORICAL_IMPORT_CUTOFF : null;
    return {
      id: u.id,
      name: `${u.first_name} ${u.last_name}`.trim(),
      appRole: u.app_role,
      eligibleStart,
      historicalEraEnd,
      hasAnyActivity: ds.size > 0 || ch.size > 0 || Boolean(cp),
      completedDates: ds,
      challengeRowDates: ch,
      challengeCheckpoint: cp?.challenge_period ? { period: cp.challenge_period, checkpointDate: cp.checkpoint_date } : null,
      challengePointsByMonth: pointsByUser.get(u.id) || {},
      checkpointSource: cp?.source || null,
    };
  });

  return { participants, months, evalEnd, challengeProgramStart, end, now: clock };
}

function evaluateAll(inputs, rules) {
  return inputs.participants.map((p) => ({
    participant: p,
    result: evaluateParticipant({
      rules, participant: p, months: inputs.months, evalEnd: inputs.evalEnd,
      challengeProgramStart: inputs.challengeProgramStart, challengePointsByMonth: p.challengePointsByMonth,
    }),
  }));
}

const summaryRow = ({ participant: p, result: r }) => ({
  id: p.id, name: p.name, appRole: p.appRole,
  projectedTier: r.projectedTier, projectedLabel: r.projectedLabel, status: r.status,
  completionRate: r.completionRate, challengeAverage: r.challengeAverage, challengePoints: r.challengePoints,
  eligibleDays: r.eligibleDays, challengeDays: r.challengeDays, completedEntries: r.completedEntries, usableMonths: r.usableMonths,
  worstCase: r.worstCase, uncertain: r.uncertain,
  dataStatus: r.dataStatus, caveats: r.caveats, insufficientReason: r.insufficientReason,
  completionTrend: r.completionTrend, evaluationStart: r.evaluationStart, evaluationEnd: r.evaluationEnd,
});

const windowInfo = (inputs) => ({ months: inputs.months, evaluationEnd: inputs.evalEnd, month: inputs.end });
const metaInfo = () => ({ ...TIER_LAB_META, shadowMode: true });

export async function getTierLabOverview({ endMonth, now } = {}) {
  const rules = getRuleSet(CURRENT_DRAFT_VERSION);
  const inputs = await loadTierInputs({ endMonth, windowMonths: rules.windowMonths, now });
  const evaluated = evaluateAll(inputs, rules);
  return {
    meta: metaInfo(), rules: publicRules(rules), window: windowInfo(inputs),
    distribution: distributionOf(evaluated.map((e) => e.result)),
    participants: evaluated.map(summaryRow),
  };
}

export async function getTierLabMember(userId, { endMonth, now } = {}) {
  const rules = getRuleSet(CURRENT_DRAFT_VERSION);
  const inputs = await loadTierInputs({ userIds: [userId], endMonth, windowMonths: rules.windowMonths, now });
  if (inputs.participants.length === 0) return null;
  const [e] = evaluateAll(inputs, rules);
  return {
    meta: metaInfo(), rules: publicRules(rules), window: windowInfo(inputs),
    participant: { id: e.participant.id, name: e.participant.name, appRole: e.participant.appRole,
      eligibleStart: e.participant.eligibleStart, historicalEraEnd: e.participant.historicalEraEnd,
      checkpointSource: e.participant.checkpointSource },
    result: e.result,
  };
}

/**
 * Rule Simulator: recomputes the distribution under PREVIEW thresholds next to
 * the saved draft. Nothing is saved — the draft rule set is frozen and the
 * preview exists only for the duration of this call.
 */
export async function simulateTierRules(previewTiers, { endMonth, now } = {}) {
  const draft = getRuleSet(CURRENT_DRAFT_VERSION);
  const preview = { ...draft, version: `${draft.version}-preview`, label: 'Preview (unsaved)', tiers: previewTiers };
  const inputs = await loadTierInputs({ endMonth, windowMonths: draft.windowMonths, now });
  const base = evaluateAll(inputs, draft);
  const prev = evaluateAll(inputs, preview);
  const changes = prev.flatMap((p, i) => {
    const b = base[i];
    const key = (e) => (e.result.status === 'insufficient' ? 'insufficient' : e.result.projectedTier ?? 'building');
    return key(p) === key(b)
      ? []
      : [{ id: p.participant.id, name: p.participant.name, from: b.result.projectedLabel, to: p.result.projectedLabel }];
  });
  return {
    meta: metaInfo(), saved: false, window: windowInfo(inputs),
    draft: { rules: publicRules(draft), distribution: distributionOf(base.map((e) => e.result)) },
    preview: { rules: publicRules(preview), distribution: distributionOf(prev.map((e) => e.result)) },
    changes,
  };
}
