// Pure unit tests for the Tier Lab rule engine (no database, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'unit-test-secret';
const { TIER_RULE_SETS, getRuleSet, CURRENT_DRAFT_VERSION } = await import('../src/config/tierRules.js');
const {
  classifyTier, evaluateParticipant, reportingBoundary, requiredDays, monthsEndingAt, distributionOf,
} = await import('../src/lib/tierEngine.js');
const { clockFrom } = await import('../src/lib/streakEngine.js');

const RULES = getRuleSet('v1');
const CH_START = '2026-03-01'; // Challenge "existed" for the whole synthetic window unless a test says otherwise

/** All required (non-Sunday) days in [start, end]. */
const days = (start, end) => requiredDays(start, end);

function evaluate({ start, months, evalEnd, done = [], points = {}, rows = null, eraEnd = null, cp = null, extra = {}, rules = RULES, chStart = CH_START }) {
  return evaluateParticipant({
    rules,
    participant: {
      id: 'p1', name: 'T', eligibleStart: start, historicalEraEnd: eraEnd, hasAnyActivity: true,
      completedDates: new Set(done), challengeRowDates: new Set(rows ?? done), challengeCheckpoint: cp, ...extra,
    },
    months, evalEnd, challengeProgramStart: chStart, challengePointsByMonth: points,
  });
}

// ── thresholds (items 1–6) ─────────────────────────────────────────────────
test('1. exact Tier 1 threshold: 90% + 15 = Tier 1 (rate computed from real days)', () => {
  assert.equal(classifyTier(RULES, 0.9, 15).tier, 1);
  // 2026-07-09..31 is exactly 20 required days; 18 done = 90.0%; 300 pts / 20 days = 15.0
  const d = days('2026-07-09', '2026-07-31');
  assert.equal(d.length, 20);
  const r = evaluate({ start: '2026-07-09', months: ['2026-07'], evalEnd: '2026-07-31', done: d.slice(0, 18), points: { '2026-07': 300 } });
  assert.equal(r.completionRate, 0.9);
  assert.equal(r.challengeAverage, 15);
  assert.equal(r.projectedTier, 1);
});

test('2. just below Tier 1 completion (89.99%) is not Tier 1', () => {
  assert.equal(classifyTier(RULES, 0.8999, 15).tier, 2);
});

test('3. just below Tier 1 Challenge average (14.99) is not Tier 1', () => {
  assert.equal(classifyTier(RULES, 0.9, 14.99).tier, 2);
  // the spec example: 95% completion with average 10 is NOT Tier 1
  assert.notEqual(classifyTier(RULES, 0.95, 10).tier, 1);
});

test('4. Tier 2 exact threshold: 60% + 11', () => {
  assert.equal(classifyTier(RULES, 0.6, 11).tier, 2);
  assert.equal(classifyTier(RULES, 0.6, 10.99).tier, 3);
});

test('5. Tier 3 exact threshold: 30% + 8', () => {
  assert.equal(classifyTier(RULES, 0.3, 8).tier, 3);
});

test('6. below Tier 3 -> Building Toward Tier 3 (either requirement)', () => {
  assert.equal(classifyTier(RULES, 0.29, 50).tier, null);
  assert.equal(classifyTier(RULES, 1, 7.99).tier, null);
  const r = evaluate({ start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-31', done: days('2026-07-01', '2026-07-05'), points: { '2026-07': 10 } });
  assert.equal(r.status, 'ok');
  assert.equal(r.projectedTier, null);
  assert.equal(r.projectedLabel, 'Building Toward Tier 3');
});

test('every tier explanation comes from the same rules (no stray thresholds): 4 explanation cases', () => {
  assert.equal(classifyTier(RULES, 0.95, 16).summary, 'Both Tier 1 requirements are currently satisfied.');
  const c = classifyTier(RULES, 0.846, 15.4);
  assert.equal(c.tier, 2);
  assert.match(c.summary, /Completion meets Tier 2; Challenge average meets Tier 1\. Limited by completion\./);
  assert.equal(c.lines.find((l) => l.metric === 'completion').met, false);
  assert.equal(c.lines.find((l) => l.metric === 'challengeAverage').met, true);
});

// ── days: Sundays, Challenge average denominator, future, partial month ───
test('7. Sundays are excluded from denominators, and a Sunday row never counts as a completion', () => {
  const week = requiredDays('2026-07-06', '2026-07-12'); // Mon..Sun
  assert.equal(week.length, 6);
  assert.ok(!week.includes('2026-07-12'));
  const done = [...days('2026-07-06', '2026-07-11'), '2026-07-12']; // incl. a Sunday row
  const r = evaluate({ start: '2026-07-06', months: ['2026-07'], evalEnd: '2026-07-12', done });
  const m = r.monthlyBreakdown[0];
  assert.equal(m.eligibleDays, 6);
  assert.equal(m.completedEntries, 6);
  assert.equal(m.missedDays, 0);
});

test('8. a missing Challenge day contributes zero: 225 pts / 27 days = 8.33, not 225 / days-with-entries', () => {
  const july = days('2026-07-01', '2026-07-31');
  assert.equal(july.length, 27);
  const r = evaluate({ start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-31', done: july, rows: july.slice(0, 10), points: { '2026-07': 225 } });
  assert.ok(Math.abs(r.challengeAverage - 225 / 27) < 1e-12);
  assert.equal(r.challengeAverage.toFixed(2), '8.33');
  assert.equal(evaluate({ start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-31', done: july, points: { '2026-07': 405 } }).challengeAverage, 15);
});

test('9. no future days: nothing after the reporting boundary is a miss', () => {
  const r = evaluate({ start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-10', done: days('2026-07-01', '2026-07-10') });
  const m = r.monthlyBreakdown[0];
  assert.equal(m.eligibleDays, 9); // Jul 1-4, 6-10
  assert.equal(m.missedDays, 0);
  assert.equal(m.completionRate, 1);
  assert.equal(m.inProgress, true);
  // a later month entirely after the boundary has no eligible days
  const later = evaluate({ start: '2026-07-01', months: ['2026-07', '2026-08'], evalEnd: '2026-07-10', done: days('2026-07-01', '2026-07-10') });
  assert.equal(later.monthlyBreakdown[1].status, 'not_eligible');
  assert.equal(later.monthlyBreakdown[1].eligibleDays, 0);
});

test('10. partial first month: days before eligibility are not counted', () => {
  const r = evaluate({ start: '2026-07-09', months: ['2026-06', '2026-07'], evalEnd: '2026-07-31', done: days('2026-07-09', '2026-07-31') });
  assert.equal(r.monthlyBreakdown[0].status, 'not_eligible');
  assert.equal(r.monthlyBreakdown[1].eligibleDays, 20);
  assert.equal(r.eligibleDays, 20);
  assert.equal(r.completionRate, 1);
});

// ── the noon / catch-up boundary (item 11) ────────────────────────────────
test('11. reporting boundary follows the canonical noon-PT submission window', () => {
  // Tue 2026-10-06. Before noon PT: Monday 10-05 is still open for catch-up -> boundary is Sun 10-04.
  assert.equal(reportingBoundary(clockFrom(new Date('2026-10-06T18:59:00Z'))), '2026-10-04');
  // At/after noon PT: Monday closed.
  assert.equal(reportingBoundary(clockFrom(new Date('2026-10-06T19:00:00Z'))), '2026-10-05');
  // Sunday morning (Saturday catch-up still open) vs Sunday after noon: Saturday closes at noon Sunday.
  assert.equal(reportingBoundary(clockFrom(new Date('2026-10-04T18:59:00Z'))), '2026-10-02');
  assert.equal(reportingBoundary(clockFrom(new Date('2026-10-04T19:00:00Z'))), '2026-10-03');
  // Monday after Sunday: Saturday closed; Sunday is not a required day anyway.
  assert.equal(reportingBoundary(clockFrom(new Date('2026-10-05T18:00:00Z'))), '2026-10-03');
  // DST end (clocks fall back Sun 2026-11-01): noon PT is 20:00Z afterward.
  assert.equal(reportingBoundary(clockFrom(new Date('2026-11-02T19:30:00Z'))), '2026-10-31'); // 11:30 AM PST Mon
  assert.equal(reportingBoundary(clockFrom(new Date('2026-11-02T20:00:00Z'))), '2026-11-01'); // 12:00 PM PST: Sunday itself is the latest closed date
});

test('11b. a participant is never marked missed for today or an open catch-up day', () => {
  const done = days('2026-10-01', '2026-10-02'); // submitted through Friday only
  const before = clockFrom(new Date('2026-10-06T18:59:00Z')); // Tue 11:59 AM: Monday still open
  const after = clockFrom(new Date('2026-10-06T19:00:00Z')); // Tue noon: Monday closed
  const run = (clock) => evaluate({ start: '2026-10-01', months: ['2026-10'], evalEnd: reportingBoundary(clock), done }).monthlyBreakdown[0];
  const b = run(before);
  const a = run(after);
  assert.equal(b.eligibleDays, 3);  // Oct 1, 2, 3 (Sat); Mon 10-05 still open, Tue not yet
  assert.equal(b.missedDays, 1);    // Sat 10-03 closed Sun noon -> a real miss
  assert.equal(a.eligibleDays, 4);  // Monday 10-05 now closed
  assert.equal(a.missedDays, 2);
});

// ── six-month math (items 12, 13) ─────────────────────────────────────────
test('12. six-month completion is weighted by real days (sum / sum), NOT an average of monthly percentages', () => {
  const jul = days('2026-07-01', '2026-07-31'); // 27 required days, all completed
  // August is cut short by the reporting boundary: only 6 required days (Aug 1,3,4,5,6,7), none completed.
  const r = evaluate({ start: '2026-07-01', months: ['2026-07', '2026-08'], evalEnd: '2026-08-07', done: jul });
  const [m1, m2] = r.monthlyBreakdown;
  assert.equal(m1.completionRate, 1);
  assert.equal(m2.eligibleDays, 6);
  assert.equal(m2.completionRate, 0);
  assert.equal(r.eligibleDays, 33);
  assert.equal(r.completedEntries, 27);
  assert.equal(r.completionRate, 27 / 33);               // weighted by days
  assert.notEqual(r.completionRate, (1 + 0) / 2);        // not the mean of monthly rates
});

test('13. one bad month does not disqualify when the combined window still meets Tier 1', () => {
  const months = monthsEndingAt('2026-08', 6);
  assert.deepEqual(months, ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  const done = [];
  for (const m of months) {
    const all = days(`${m}-01`, `${m}-${m === '2026-06' ? '30' : m === '2026-04' ? '30' : '31'}`);
    done.push(...(m === '2026-06' ? all.slice(0, 12) : all)); // June: only 12 of 26
  }
  const points = Object.fromEntries(months.map((m) => [m, 17 * done.filter((d) => d.startsWith(m)).length]));
  const r = evaluate({ start: '2026-03-01', months, evalEnd: '2026-08-31', done, points });
  const june = r.monthlyBreakdown.find((m) => m.month === '2026-06');
  assert.ok(june.completionRate < 0.5);
  assert.equal(june.projectedTier, null); // June alone: Building
  assert.ok(r.completionRate >= 0.9, `combined completion ${r.completionRate}`);
  assert.ok(r.challengeAverage >= 15, `combined avg ${r.challengeAverage}`);
  assert.equal(r.projectedTier, 1);
});

// ── history honesty: Base44 / checkpoints (items 14 engine side) ──────────
test('14a. days on/before the historical-era end with no record are UNVERIFIABLE, not misses and not completions', () => {
  const sept = days('2026-09-01', '2026-09-30');
  const done = sept.filter((d) => d >= '2026-09-04'); // nothing recorded Sep 1-3
  const r = evaluate({ start: '2026-09-01', months: ['2026-09'], evalEnd: '2026-09-30', done, eraEnd: '2026-09-06', points: { '2026-09': 300 } });
  const m = r.monthlyBreakdown[0];
  assert.equal(m.unverifiableDays, 3);
  assert.equal(m.missedDays, 0);
  assert.equal(m.completionDenominator, m.eligibleDays - 3);
  assert.equal(m.status, 'partial');
  assert.equal(m.completionRate, 1);
  assert.ok(m.completionRateWorstCase < 1); // counting them as misses
});

test('14b. a month with too many unverifiable days is excluded, never guessed ("insufficient historical detail")', () => {
  const aug = days('2026-08-01', '2026-08-31');
  const r = evaluate({ start: '2026-08-01', months: ['2026-08'], evalEnd: '2026-08-31', done: aug.slice(0, 10), eraEnd: '2026-09-03', points: { '2026-08': 100 } });
  const m = r.monthlyBreakdown[0];
  assert.equal(m.status, 'insufficient_history');
  assert.equal(m.completionRate, null);
  assert.equal(r.status, 'insufficient');
  assert.equal(r.projectedLabel, 'Insufficient Data');
});

test('14c. a Challenge checkpoint aggregate covers its days (not unverifiable); no raw row required', () => {
  const sept = days('2026-09-01', '2026-09-30');
  const doneAfter = sept.filter((d) => d > '2026-09-06');
  const r = evaluate({
    start: '2026-09-01', months: ['2026-09'], evalEnd: '2026-09-30', done: sept, rows: doneAfter, eraEnd: '2026-09-06',
    cp: { period: '2026-09', checkpointDate: '2026-09-06' }, points: { '2026-09': 400 },
  });
  const m = r.monthlyBreakdown[0];
  assert.equal(m.challengeUnverifiableDays, 0);
  assert.equal(m.challengeDays, m.eligibleDays);
});

test('14c2. usability is judged per measure: Daily Score history can be excluded while checkpoint-covered Challenge data still counts', () => {
  const sept = days('2026-09-01', '2026-09-30');
  const after = sept.filter((d) => d > '2026-09-15');
  const r = evaluate({
    start: '2026-09-01', months: ['2026-09'], evalEnd: '2026-09-30', done: after, rows: after, eraEnd: '2026-09-15',
    cp: { period: '2026-09', checkpointDate: '2026-09-15' }, points: { '2026-09': 520 },
  });
  const m = r.monthlyBreakdown[0];
  assert.equal(m.completionStatus, 'excluded');   // 11 of 26 days unverifiable
  assert.equal(m.challengeStatus, 'complete');    // the aggregate covers Sep 1-15
  assert.equal(m.status, 'partial_history');
  assert.equal(m.completionRate, null);
  assert.equal(m.challengeAverage, 520 / 26);
  assert.equal(r.challengeAverage, 520 / 26);
  assert.equal(r.completionRate, null);
  assert.equal(r.status, 'insufficient');         // not enough verifiable completion days
});

test('14d. no Challenge denominator before the Challenge existed', () => {
  const may = days('2026-05-01', '2026-05-31');
  const r = evaluate({ start: '2026-05-01', months: ['2026-05'], evalEnd: '2026-05-31', done: may, chStart: '2026-06-03' });
  assert.equal(r.monthlyBreakdown[0].challengeDays, 0);
  assert.equal(r.monthlyBreakdown[0].challengeAverage, null);
});

// ── shields (item 15) ─────────────────────────────────────────────────────
test('15. a shield-protected missed day is still a missed entry (shields are not an input)', () => {
  const july = days('2026-07-01', '2026-07-31');
  const missing = '2026-07-15';
  const done = july.filter((d) => d !== missing);
  const plain = evaluate({ start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-31', done });
  const shielded = evaluate({
    start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-31', done,
    extra: { streakShields: 3, shieldConsumedDates: [missing], streak: 40 },
  });
  assert.equal(shielded.monthlyBreakdown[0].missedDays, 1);
  assert.equal(shielded.monthlyBreakdown[0].completedEntries, 26);
  assert.deepEqual(shielded.monthlyBreakdown, plain.monthlyBreakdown);
});

// ── insufficient data & uncertainty ───────────────────────────────────────
test('too few eligible days or no activity -> Insufficient Data (never a fake tier)', () => {
  const few = evaluate({ start: '2026-10-01', months: ['2026-10'], evalEnd: '2026-10-05', done: days('2026-10-01', '2026-10-05'), points: { '2026-10': 100 } });
  assert.equal(few.status, 'insufficient');
  assert.equal(few.projectedTier, null);
  const none = evaluateParticipant({
    rules: RULES, participant: { id: 'x', eligibleStart: '2026-09-01', historicalEraEnd: null, hasAnyActivity: false, completedDates: new Set(), challengeRowDates: new Set(), challengeCheckpoint: null },
    months: ['2026-09'], evalEnd: '2026-09-30', challengeProgramStart: CH_START, challengePointsByMonth: {},
  });
  assert.equal(none.status, 'insufficient');
  assert.match(none.insufficientReason, /No Daily Score or Challenge activity/);
});

test('uncertain flag: the tier would change if unverifiable days were misses', () => {
  const sept = days('2026-09-01', '2026-09-30');
  const done = sept.filter((d) => d >= '2026-09-04'); // 3 unverifiable of 26 => 100% verified, 88.5% worst case
  const r = evaluate({ start: '2026-09-01', months: ['2026-09'], evalEnd: '2026-09-30', done, eraEnd: '2026-09-03', points: { '2026-09': 26 * 16 } });
  assert.equal(r.projectedTier, 1);
  assert.equal(r.worstCase.projectedTier, 2);
  assert.equal(r.uncertain, true);
});

test('trend is only reported from two real months with enough days', () => {
  const months = ['2026-06', '2026-07'];
  const jun = days('2026-06-01', '2026-06-30'); const jul = days('2026-07-01', '2026-07-31');
  const r = evaluate({ start: '2026-06-01', months, evalEnd: '2026-07-31', done: [...jun.slice(0, 13), ...jul], points: {} });
  assert.equal(r.completionTrend.direction, 'improving');
  const one = evaluate({ start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-31', done: jul });
  assert.equal(one.completionTrend, null);
});

test('distribution counts every status exactly once', () => {
  const d = distributionOf([
    { status: 'ok', projectedTier: 1 }, { status: 'ok', projectedTier: 2 }, { status: 'ok', projectedTier: 3 },
    { status: 'ok', projectedTier: null }, { status: 'insufficient', projectedTier: null },
  ]);
  assert.deepEqual(d, { tier1: 1, tier2: 1, tier3: 1, building: 1, insufficient: 1, total: 5 });
});

// ── rule architecture (item 18 immutability) ──────────────────────────────
test('18a. saved rules are frozen and versioned; a preview rule set is a separate object', () => {
  assert.equal(CURRENT_DRAFT_VERSION, 'v1');
  assert.equal(RULES.status, 'draft');
  assert.equal(RULES.participantVisible, false);
  assert.equal(RULES.effectiveForOfficialAwards, false);
  assert.throws(() => { RULES.tiers[0].minCompletion = 0.5; }, TypeError);
  assert.throws(() => { TIER_RULE_SETS.v1 = {}; }, TypeError);
  const r = evaluate({ start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-31', done: days('2026-07-01', '2026-07-31') });
  assert.equal(r.ruleVersion, 'v1');
  // a different rule set changes the verdict without touching the saved one
  const lenient = { ...RULES, version: 'v1-preview', tiers: [{ tier: 1, minCompletion: 0.1, minChallengeAvg: 0 }, { tier: 2, minCompletion: 0.1, minChallengeAvg: 0 }, { tier: 3, minCompletion: 0.1, minChallengeAvg: 0 }] };
  assert.equal(evaluate({ start: '2026-07-01', months: ['2026-07'], evalEnd: '2026-07-31', done: days('2026-07-01', '2026-07-31'), rules: lenient }).projectedTier, 1);
  assert.equal(RULES.tiers[0].minCompletion, 0.9);
});

// ── access control (items 16, 17) ─────────────────────────────────────────
test('16/17. Tier Lab is mounted under the HQ router, behind requireAuth + requireHQAccess', async () => {
  const { default: hqRouter } = await import('../src/routes/hq/index.js');
  const { requireAuth, requireHQAccess } = await import('../src/middleware/auth.js');
  assert.equal(hqRouter.stack[0].handle, requireAuth, 'auth is the first layer');
  assert.equal(hqRouter.stack[1].handle, requireHQAccess, 'HQ role check is the second layer');
  const tierIdx = hqRouter.stack.findIndex((l) => l.matchers?.some((m) => m('/tier-lab/members/abc')));
  assert.ok(tierIdx > 1, `tier-lab mounted after both guards (index ${tierIdx})`);
});

test('16/17. requireHQAccess: participant denied; staff, admin, super_admin allowed; anonymous 401', async () => {
  const { requireHQAccess } = await import('../src/middleware/auth.js');
  const run = (user) => {
    const out = { status: null, nexted: false };
    const res = { status(c) { out.status = c; return this; }, json() { return this; } };
    requireHQAccess({ user }, res, () => { out.nexted = true; });
    return out;
  };
  assert.deepEqual(run({ system_role: 'participant' }), { status: 403, nexted: false });
  for (const role of ['staff', 'admin', 'super_admin']) assert.deepEqual(run({ system_role: role }), { status: null, nexted: true }, role);
  assert.deepEqual(run(undefined), { status: 401, nexted: false });
  // app_role 'staff' alone (the other, unrelated dimension) must not grant HQ access
  assert.deepEqual(run({ system_role: 'participant', app_role: 'staff' }), { status: 403, nexted: false });
});
