// Unit tests for Inspire Challenge scoring — focused on the Reading daily cap
// (1.5 points for entries dated on/after READING_CAP_EFFECTIVE_DATE) and on
// proving nothing else about scoring moved. No database; run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSummerPoints,
  calculateSummerPointsBreakdown,
  buildSummerEntryValues,
  readingPoints,
  readingMaxPointsFor,
  readingMaxSessionsFor,
  READING_CAP_EFFECTIVE_DATE,
  READING_MAX_POINTS,
  LEGACY_READING_MAX_POINTS,
  SUMMER_CHALLENGE_CATEGORIES,
  SUMMER_CHALLENGE_MAX_POINTS,
  LEGACY_SUMMER_CHALLENGE_MAX_POINTS,
} from '../src/lib/summerChallenge.js';
import { expectedTotalForRow } from '../src/agents/summerChallengeAgent.js';

const OLD_DAY = '2026-11-23'; // last day scored under the original cap
const NEW_DAY = '2026-11-24'; // first day scored under the 1.5 cap
const LATER_DAY = '2027-03-15';

// Verbatim copy of the scoring formula as it stood BEFORE the Reading change.
// If the shared code ever drifts for any other category, or for old dates,
// the parity tests below fail.
function referenceOldFormula(entry) {
  const SCREEN = { 1: 3, 2: 2, 3: 1, 4: 0 };
  const COLD = { plunge: 1, shower: 0.5, none: 0 };
  let p = 0;
  if (entry.sleepBedBefore10) p += 1;
  if (entry.sleep8h) p += 1;
  if (entry.hydration) p += 1;
  if (entry.exercise) p += 2;
  if (entry.screenTimeTier) p += SCREEN[entry.screenTimeTier] || 0;
  p += Math.min(3, Number(entry.mindfulnessSessions) || 0);
  p += Math.min(4, Number(entry.readingSessions) || 0);
  if (entry.dailyUpdateSent) p += 4;
  if (entry.nutrition) p += 1;
  if (entry.coldPlungeType) p += COLD[entry.coldPlungeType] || 0;
  p += Math.floor((Number(entry.projectMinutes) || 0) / 30);
  return p;
}

const EMPTY = {
  sleepBedBefore10: false, sleep8h: false, hydration: false, exercise: false, screenTimeTier: null,
  mindfulnessSessions: 0, readingSessions: 0, dailyUpdateSent: false, nutrition: false, coldPlungeType: null, projectMinutes: 0,
};
const FULL_EXCEPT_READING = {
  sleepBedBefore10: true, sleep8h: true, hydration: true, exercise: true, screenTimeTier: 1,
  mindfulnessSessions: 3, readingSessions: 0, dailyUpdateSent: true, nutrition: true, coldPlungeType: 'plunge', projectMinutes: 0,
};

test('Reading cap constants: 1.5 now, 4 for history, switch on 2026-11-24', () => {
  assert.equal(READING_MAX_POINTS, 1.5);
  assert.equal(LEGACY_READING_MAX_POINTS, 4);
  assert.equal(READING_CAP_EFFECTIVE_DATE, '2026-11-24');
  assert.equal(readingMaxPointsFor(OLD_DAY), 4);
  assert.equal(readingMaxPointsFor(NEW_DAY), 1.5);
  assert.equal(readingMaxPointsFor(LATER_DAY), 1.5);
  assert.equal(readingMaxPointsFor('2026-06-03'), 4);
});

test('Reading points BELOW the cap are unchanged (0 and 1 session)', () => {
  assert.equal(readingPoints(0, NEW_DAY), 0);
  assert.equal(readingPoints(1, NEW_DAY), 1);
  assert.equal(calculateSummerPoints({ ...EMPTY, readingSessions: 1 }, NEW_DAY), 1);
});

test('Reading points AT the cap: two sessions earn exactly 1.5', () => {
  assert.equal(readingPoints(2, NEW_DAY), 1.5);
  assert.equal(calculateSummerPoints({ ...EMPTY, readingSessions: 2 }, NEW_DAY), 1.5);
  assert.equal(readingPoints(1.5, NEW_DAY), 1.5); // fractional input lands exactly on the cap
});

test('Reading points ABOVE the cap never exceed 1.5 (3, 4, 100, 1e9 sessions)', () => {
  for (const n of [3, 4, 5, 100, 1e9]) {
    assert.equal(readingPoints(n, NEW_DAY), 1.5, `${n} sessions`);
    assert.equal(calculateSummerPoints({ ...EMPTY, readingSessions: n }, NEW_DAY), 1.5);
  }
  assert.equal(readingPoints(Infinity, NEW_DAY), 1.5);
});

test('Bad Reading input counts as 0, never negative or NaN', () => {
  for (const v of [-1, -0.5, NaN, undefined, null, 'abc', '', {}, [], false]) {
    assert.equal(readingPoints(v, NEW_DAY), 0, `input ${String(v)}`);
  }
  assert.equal(readingPoints('2', NEW_DAY), 1.5); // numeric strings (JSON bodies) still work
});

test('Entries dated BEFORE the effective date keep the original 4-point cap (history is never re-scored)', () => {
  for (const [sessions, expected] of [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [9, 4]]) {
    assert.equal(readingPoints(sessions, OLD_DAY), expected, `${sessions} sessions on the old date`);
  }
  // The real 2026-11-20 entry: 4 reading sessions, stored 22.5 points, must still verify.
  const nov20 = { ...FULL_EXCEPT_READING, mindfulnessSessions: 3, readingSessions: 4, exercise: true, screenTimeTier: 1, coldPlungeType: 'plunge', projectMinutes: 0 };
  assert.equal(calculateSummerPoints(nov20, '2026-11-20'), referenceOldFormula(nov20));
});

test('Exact boundary: 2026-11-23 is old rules, 2026-11-24 is new rules', () => {
  const e = { ...EMPTY, readingSessions: 4 };
  assert.equal(calculateSummerPoints(e, '2026-11-23'), 4);
  assert.equal(calculateSummerPoints(e, '2026-11-24'), 1.5);
});

test('PARITY: before the effective date, every combination scores exactly as the original formula did', () => {
  const tiers = [null, 1, 2, 3, 4];
  const colds = [null, 'plunge', 'shower', 'none'];
  let checked = 0;
  for (const reading of [0, 1, 2, 3, 4])
    for (const mind of [0, 1, 2, 3])
      for (const tier of tiers)
        for (const cold of colds)
          for (const mins of [0, 29, 30, 59, 60, 125, 960])
            for (const flags of [0, 0b11111, 0b10101, 0b01010]) {
              const e = {
                sleepBedBefore10: !!(flags & 1), sleep8h: !!(flags & 2), hydration: !!(flags & 4), exercise: !!(flags & 8), dailyUpdateSent: !!(flags & 16),
                nutrition: !!(flags & 2),
                screenTimeTier: tier, coldPlungeType: cold, mindfulnessSessions: mind, readingSessions: reading, projectMinutes: mins,
              };
              assert.equal(calculateSummerPoints(e, OLD_DAY), referenceOldFormula(e));
              assert.equal(calculateSummerPoints(e, '2026-09-05'), referenceOldFormula(e));
              checked++;
            }
  assert.ok(checked > 5000);
});

test('PARITY: on/after the effective date, ONLY Reading changed — every other category scores as before', () => {
  const tiers = [null, 1, 2, 3, 4];
  const colds = [null, 'plunge', 'shower', 'none'];
  for (const reading of [0, 1, 2, 3, 4])
    for (const mind of [0, 1, 2, 3])
      for (const tier of tiers)
        for (const cold of colds)
          for (const mins of [0, 30, 125]) {
            const e = {
              sleepBedBefore10: true, sleep8h: true, hydration: true, exercise: true, dailyUpdateSent: true, nutrition: true,
              screenTimeTier: tier, coldPlungeType: cold, mindfulnessSessions: mind, readingSessions: reading, projectMinutes: mins,
            };
            const now = calculateSummerPoints(e, NEW_DAY);
            const before = referenceOldFormula(e);
            const readingDelta = Math.min(4, reading) - Math.min(1.5, reading);
            assert.equal(now, before - readingDelta, `reading=${reading}`);
          }
});

test('Other categories keep their own maximums (no limit besides Reading changed)', () => {
  const byId = Object.fromEntries(SUMMER_CHALLENGE_CATEGORIES.map((c) => [c.id, c]));
  assert.deepEqual(
    Object.fromEntries(Object.entries(byId).map(([id, c]) => [id, c.max])),
    {
      sleepBedBefore10: 1, sleep8h: 1, hydration: 1, exercise: 2, screenTimeTier: 3, mindfulnessSessions: 3,
      readingSessions: 1.5, dailyUpdateSent: 4, nutrition: 1, coldPlungeType: 1, projectMinutes: null,
    }
  );
  assert.equal(byId.readingSessions.legacyMax, 4);
  const maxed = { ...FULL_EXCEPT_READING, readingSessions: 99 };
  const { categories } = calculateSummerPointsBreakdown(maxed, NEW_DAY);
  assert.equal(categories.mindfulnessSessions, 3);
  assert.equal(categories.exercise, 2);
  assert.equal(categories.screenTimeTier, 3);
  assert.equal(categories.dailyUpdateSent, 4);
  assert.equal(categories.readingSessions, 1.5);
});

test('Fixed-category daily maximum: 18.5 now (was 21)', () => {
  assert.equal(SUMMER_CHALLENGE_MAX_POINTS, 18.5);
  assert.equal(LEGACY_SUMMER_CHALLENGE_MAX_POINTS, 21);
  const best = { ...FULL_EXCEPT_READING, readingSessions: 4 };
  assert.equal(calculateSummerPoints(best, NEW_DAY), 18.5);
  assert.equal(calculateSummerPoints(best, OLD_DAY), 21);
});

test('Project/Volunteer Work stays uncapped by the Reading change', () => {
  assert.equal(calculateSummerPoints({ ...EMPTY, projectMinutes: 960 }, NEW_DAY), 32);
});

test('Breakdown total equals the sum of its categories (one source of truth)', () => {
  const e = { ...FULL_EXCEPT_READING, readingSessions: 4, projectMinutes: 95 };
  for (const d of [OLD_DAY, NEW_DAY]) {
    const { categories, total } = calculateSummerPointsBreakdown(e, d);
    assert.equal(total, Object.values(categories).reduce((a, b) => a + b, 0));
    assert.equal(total, calculateSummerPoints(e, d));
  }
});

test('A missing or malformed entry date throws instead of silently choosing a rule', () => {
  for (const bad of [undefined, null, '', '2026-1-5', 20261124, new Date('2026-11-24'), '2026-11-24T00:00:00Z']) {
    assert.throws(() => calculateSummerPoints(EMPTY, bad), TypeError, `date ${String(bad)}`);
    assert.throws(() => readingMaxPointsFor(bad), TypeError);
  }
});

test('readingMaxSessionsFor: how many sessions can still add points', () => {
  assert.equal(readingMaxSessionsFor(NEW_DAY), 2);
  assert.equal(readingMaxSessionsFor(OLD_DAY), 4);
});

// ── API-input hardening: what the server will actually store ───────────────

test('buildSummerEntryValues clamps Reading sessions to the day\'s cap — extra reading cannot be stored', () => {
  for (const [sent, stored] of [[0, 0], [1, 1], [2, 2], [3, 2], [4, 2], [99, 2], [-5, 0], ['4', 2], [1.4, 1], [1.6, 2], ['abc', 0], [undefined, 0], [null, 0], [Infinity, 2]]) {
    assert.equal(buildSummerEntryValues({ readingSessions: sent }, NEW_DAY).readingSessions, stored, `sent ${String(sent)}`);
  }
  // Old date: original ceiling of 4 sessions still applies (and still fits the DB's CHECK <= 4).
  assert.equal(buildSummerEntryValues({ readingSessions: 4 }, OLD_DAY).readingSessions, 4);
  assert.equal(buildSummerEntryValues({ readingSessions: 99 }, OLD_DAY).readingSessions, 4);
});

test('Whatever a client sends, stored Reading points never exceed 1.5 and a client "total" is ignored', () => {
  const hostile = { readingSessions: 4, totalPoints: 9999, total_points: 9999, readingPoints: 50, projectMinutes: 0 };
  const values = buildSummerEntryValues(hostile, NEW_DAY);
  assert.ok(!('totalPoints' in values) && !('total_points' in values) && !('readingPoints' in values));
  assert.equal(calculateSummerPoints(values, NEW_DAY), 1.5);
});

test('buildSummerEntryValues leaves the other categories\' clamps as they were', () => {
  const v = buildSummerEntryValues({ mindfulnessSessions: 9, screenTimeTier: 7, coldPlungeType: 'lava', projectMinutes: 100000, exercise: 'yes' }, NEW_DAY);
  assert.equal(v.mindfulnessSessions, 3);
  assert.equal(v.screenTimeTier, null);
  assert.equal(v.coldPlungeType, null);
  assert.equal(v.projectMinutes, 960);
  assert.equal(v.exercise, true);
  assert.deepEqual(buildSummerEntryValues(undefined, NEW_DAY), { ...EMPTY });
});

test('Many sessions across a day cannot add up: a day is ONE entry, scored once at the cap', () => {
  // The route only ever stores one row per (user, date) (database UNIQUE + 409 on repeat), so the
  // most Reading a day can ever contribute is one capped entry.
  const one = calculateSummerPoints(buildSummerEntryValues({ readingSessions: 4 }, NEW_DAY), NEW_DAY);
  assert.equal(one, 1.5);
});

// ── The 15-minute drift-correcting agent must agree with the rules per date ──

const rowFor = (date, readingSessions, total) => ({
  date, total_points: total, reading_sessions: readingSessions,
  sleep_bed_before_10: false, sleep_8h: false, hydration: false, exercise: false, screen_time_tier: null,
  mindfulness_sessions: 0, daily_update_sent: false, nutrition: false, cold_plunge_type: null, project_minutes: 0,
});

test('Agent: an OLD-dated row with 4 sessions keeps its 4 points (no "drift correction" of history)', () => {
  assert.equal(expectedTotalForRow(rowFor('2026-11-21', 4, 4)), 4);
  assert.equal(expectedTotalForRow(rowFor('2026-11-23', 2, 2)), 2);
});

test('Agent: a NEW-dated row expects the capped value', () => {
  assert.equal(expectedTotalForRow(rowFor('2026-11-24', 2, 1.5)), 1.5);
  assert.equal(expectedTotalForRow(rowFor('2026-11-24', 4, 4)), 1.5); // would be corrected down if one ever slipped in uncapped
});
