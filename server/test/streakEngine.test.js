// Canonical streak/shield engine tests — run with `npm test` (node:test,
// no extra dependencies). Pure-function tests: fixed dates and an explicit
// {today, beforeNoon} clock, so every result is reproducible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayStreak, isDeadlineClosed, clockFrom, calculateStreak, STREAK_CONSTANTS } from '../src/lib/streakEngine.js';
import { addDays, ptDayOfWeek } from '../src/config/pacificTime.js';

// N consecutive REQUIRED (non-Sunday) dates starting at `start` (inclusive).
function requiredDays(start, n) {
  const out = [];
  let d = start;
  while (out.length < n) {
    if (ptDayOfWeek(d) !== 0) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
const after = (d) => ({ today: addDays(d, 1), beforeNoon: false }); // evaluated after `d`'s deadline closed

// 2026-11-02 is a Monday.
const MON = '2026-11-02';

test('A: 6 completions -> 0 shields; 7th completion -> 1/3', () => {
  const six = requiredDays(MON, 6);
  assert.equal(replayStreak({ submittedDates: six, ...after(six.at(-1)) }).shields, 0);
  const seven = requiredDays(MON, 7);
  const r = replayStreak({ submittedDates: seven, ...after(seven.at(-1)) });
  assert.equal(r.streak, 7);
  assert.equal(r.shields, 1);
  assert.deepEqual(r.events.filter((e) => e.type === 'earned').map((e) => e.date), [seven[6]]);
});

test('B/C/D: 14 -> 2/3, 21 -> 3/3, 28 stays 3/3 (never above max)', () => {
  for (const [n, expected] of [[14, 2], [21, 3], [28, 3], [70, 3]]) {
    const days = requiredDays(MON, n);
    const r = replayStreak({ submittedDates: days, ...after(days.at(-1)) });
    assert.equal(r.streak, n);
    assert.equal(r.shields, expected, `${n} completions`);
    assert.ok(r.shields <= STREAK_CONSTANTS.MAX_SHIELDS);
  }
});

// Build: N completions, then one missed required day, evaluated after its deadline.
function missAfter(n) {
  const days = requiredDays(MON, n);
  let missed = addDays(days.at(-1), 1);
  if (ptDayOfWeek(missed) === 0) missed = addDays(missed, 1);
  return { days, missed, r: replayStreak({ submittedDates: days, ...after(missed) }) };
}

test('E: 3 shields + miss -> streak unchanged, 2/3', () => {
  const { r, missed } = missAfter(21);
  assert.equal(r.streak, 21);
  assert.equal(r.shields, 2);
  assert.deepEqual(r.events.filter((e) => e.type === 'consumed').map((e) => e.date), [missed]);
});

test('F/G: 2 shields + miss -> 1/3; 1 shield + miss -> 0/3', () => {
  assert.deepEqual([missAfter(14).r.streak, missAfter(14).r.shields], [14, 1]);
  assert.deepEqual([missAfter(7).r.streak, missAfter(7).r.shields], [7, 0]);
});

test('H: 0 shields + miss -> normal reset to 0', () => {
  const { r } = missAfter(5);
  assert.equal(r.streak, 0);
  assert.equal(r.shields, 0);
  assert.equal(r.events.at(-1).type, 'reset');
});

test('shield consumption restarts earning: needs 7 FRESH days after the miss', () => {
  // 7 days (1 shield), miss (0 shields, streak 7), then 6 more -> still 0; 7th -> 1.
  const first = requiredDays(MON, 7);
  let missed = addDays(first.at(-1), 1);
  if (ptDayOfWeek(missed) === 0) missed = addDays(missed, 1);
  const next = requiredDays(addDays(missed, 1), 7);
  const r6 = replayStreak({ submittedDates: [...first, ...next.slice(0, 6)], ...after(next[5]) });
  assert.deepEqual([r6.streak, r6.shields], [13, 0]);
  const r7 = replayStreak({ submittedDates: [...first, ...next], ...after(next[6]) });
  assert.deepEqual([r7.streak, r7.shields], [14, 1]);
});

test('I: Sunday never breaks, never counts, never earns or consumes — even with a row', () => {
  const days = requiredDays(MON, 6); // Mon..Sat
  const sunday = addDays(days.at(-1), 1);
  assert.equal(ptDayOfWeek(sunday), 0);
  const withoutSunday = replayStreak({ submittedDates: days, today: addDays(sunday, 1), beforeNoon: false });
  const withSundayRow = replayStreak({ submittedDates: [...days, sunday], today: addDays(sunday, 1), beforeNoon: false });
  assert.deepEqual([withoutSunday.streak, withoutSunday.shields], [6, 0]);
  assert.deepEqual(withSundayRow, withoutSunday);
});

test('J: repeated replay x10 on unchanged data is identical', () => {
  const input = { submittedDates: [...requiredDays(MON, 9), ...requiredDays('2026-11-16', 5)], today: '2026-11-25', beforeNoon: false };
  const first = JSON.stringify(replayStreak(input));
  for (let i = 0; i < 10; i++) assert.equal(JSON.stringify(replayStreak(input)), first);
});

test('K: checkpoint baseline applied exactly once — pre-baseline rows never double-counted', () => {
  const pre = requiredDays('2026-10-01', 20); // real rows already represented by the checkpoint
  const post = requiredDays('2026-11-02', 3);
  const baseline = { date: '2026-11-01', streak: 93 };
  const r = replayStreak({ submittedDates: [...pre, ...post], baseline, ...after(post.at(-1)) });
  assert.equal(r.streak, 96);
  const noPre = replayStreak({ submittedDates: post, baseline, ...after(post.at(-1)) });
  assert.deepEqual(r, noPre);
});

test('K2: a migrated streak length never implies shields', () => {
  const r = replayStreak({ submittedDates: [], baseline: { date: '2026-11-01', streak: 120 }, today: '2026-11-02', beforeNoon: true });
  assert.deepEqual([r.streak, r.shields], [120, 0]);
});

test('L: an admin correction (encoded as a checkpoint) is a baseline, not a repeated delta', () => {
  const baseline = { date: '2026-11-01', streak: 4 };
  const post = requiredDays('2026-11-02', 2);
  const runs = Array.from({ length: 5 }, () => replayStreak({ submittedDates: post, baseline, ...after(post.at(-1)) }).streak);
  assert.deepEqual(runs, [6, 6, 6, 6, 6]);
});

test('M: deleting one Daily Score changes only that input’s result, deterministically', () => {
  const days = requiredDays(MON, 10);
  const clock = after(days.at(-1));
  const full = replayStreak({ submittedDates: days, ...clock });
  const minusOne = replayStreak({ submittedDates: days.filter((d) => d !== days[3]), ...clock });
  // 3 counted, then a miss with 0 shields (reset), then 6 more.
  assert.deepEqual([full.streak, full.shields], [10, 1]);
  assert.deepEqual([minusOne.streak, minusOne.shields], [6, 0]);
  // The other user's identical input is unaffected by this user's deletion.
  assert.deepEqual(replayStreak({ submittedDates: days, ...clock }), full);
});

test('N: Nelli Holland production reproduction — no retroactive +10', () => {
  // Her real daily_scores (2026-09-02..2026-10-03) and her checkpoint (Sep 6 = 4).
  const dates = [
    '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10',
    '2026-09-12', '2026-09-14', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-21',
    '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28', '2026-09-29',
    '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
  ];
  const r = replayStreak({ submittedDates: dates, baseline: { date: '2026-09-06', streak: 4 }, today: '2026-10-04', beforeNoon: false });
  assert.equal(r.streak, 16, 'resets on Sep 11 and Sep 15 (no shield yet) stand; 16 real days since Sep 16');
  assert.equal(r.shields, 2, 'earned Sep 23 and Oct 1; never spent on the old Sep 11/15 gaps');
  assert.deepEqual(r.events.filter((e) => e.type === 'reset').map((e) => e.date), ['2026-09-11', '2026-09-15']);
  assert.deepEqual(r.events.filter((e) => e.type === 'consumed'), []);
});

test('Samuel Freeman reproduction — no shield is ever spent before the first submission', () => {
  const dates = requiredDays('2026-09-09', 22);
  const r = replayStreak({ submittedDates: dates, today: '2026-10-04', beforeNoon: false });
  assert.equal(r.events.filter((e) => e.type === 'consumed').length, 0);
  assert.ok(r.events.every((e) => e.date >= '2026-09-09'));
});

test('Yuni reproduction — shield consumed on the miss, then a later real gap resets', () => {
  const dates = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14', '2026-09-16'];
  const r = replayStreak({ submittedDates: dates, baseline: { date: '2026-09-06', streak: 4 }, today: '2026-09-17', beforeNoon: false });
  // Sep 14 = 7th post-checkpoint completion -> shield; Sep 15 miss consumes it; Sep 16 counts.
  assert.deepEqual([r.streak, r.shields], [12, 0]);
  assert.deepEqual(r.events.map((e) => `${e.type}@${e.date}`), ['earned@2026-09-14', 'consumed@2026-09-15']);
  const later = replayStreak({ submittedDates: dates, baseline: { date: '2026-09-06', streak: 4 }, today: '2026-09-18', beforeNoon: false });
  assert.deepEqual([later.streak, later.shields], [0, 0], 'Sep 17 miss with no shield left resets');
});

// ── Timezone / deadline boundaries (America/Los_Angeles) ──────────────────
test('weekday before noon: yesterday is still pending (not a miss)', () => {
  const r = replayStreak({ submittedDates: ['2026-11-02'], today: '2026-11-04', beforeNoon: true }); // Tue pending
  assert.equal(r.streak, 1);
  assert.deepEqual(r.pendingDates, ['2026-11-03', '2026-11-04']);
});

test('weekday after noon: yesterday is a closed miss', () => {
  const r = replayStreak({ submittedDates: ['2026-11-02'], today: '2026-11-04', beforeNoon: false });
  assert.equal(r.streak, 0);
  assert.deepEqual(r.pendingDates, ['2026-11-04']);
});

test('Sunday before noon: Saturday catch-up still open; Sunday after noon: Saturday closed', () => {
  const sat = '2026-11-07';
  const sun = '2026-11-08';
  assert.equal(ptDayOfWeek(sun), 0);
  const fri = requiredDays(MON, 5);
  assert.equal(replayStreak({ submittedDates: fri, today: sun, beforeNoon: true }).streak, 5);
  assert.deepEqual(replayStreak({ submittedDates: fri, today: sun, beforeNoon: true }).pendingDates, [sat]);
  assert.equal(replayStreak({ submittedDates: fri, today: sun, beforeNoon: false }).streak, 0);
  assert.equal(replayStreak({ submittedDates: [...fri, sat], today: sun, beforeNoon: false }).streak, 6);
});

test('Monday after Sunday: Sunday is not required; Saturday already closed', () => {
  const week = requiredDays(MON, 6); // Mon..Sat
  const r = replayStreak({ submittedDates: week, today: '2026-11-09', beforeNoon: true });
  assert.equal(r.streak, 6);
  assert.deepEqual(r.pendingDates, ['2026-11-09']);
});

test('DST end (Sun 2026-11-01) and start (Sun 2026-03-08): noon cutoff and dates stay correct', () => {
  // PDT: 2026-10-31 18:59Z = 11:59 PDT (before noon); 19:00Z = 12:00 PDT.
  assert.equal(clockFrom(new Date('2026-10-31T18:59:00Z')).beforeNoon, true);
  assert.equal(clockFrom(new Date('2026-10-31T19:00:00Z')).beforeNoon, false);
  // PST: 2026-11-02 19:59Z = 11:59 PST; 20:00Z = 12:00 PST.
  assert.equal(clockFrom(new Date('2026-11-02T19:59:00Z')).beforeNoon, true);
  assert.equal(clockFrom(new Date('2026-11-02T20:00:00Z')).beforeNoon, false);
  assert.equal(clockFrom(new Date('2026-11-02T07:30:00Z')).today, '2026-11-01'); // 23:30 PST Sunday
  assert.equal(clockFrom(new Date('2026-03-09T18:59:00Z')).beforeNoon, true); // 11:59 PDT
  // A streak straddling the DST change: no duplicate or skipped days.
  const span = requiredDays('2026-10-26', 12);
  const r = replayStreak({ submittedDates: span, ...after(span.at(-1)) });
  assert.equal(r.streak, 12);
  assert.equal(new Set(r.countedDates).size, 12);
});

test('month transition counts each required day exactly once', () => {
  const span = requiredDays('2026-09-28', 8); // crosses into October
  const r = replayStreak({ submittedDates: span, ...after(span.at(-1)) });
  assert.equal(r.streak, 8);
  assert.deepEqual(r.countedDates, span);
});

test('isDeadlineClosed: noon PT the next calendar day', () => {
  assert.equal(isDeadlineClosed('2026-11-03', '2026-11-04', true), false);
  assert.equal(isDeadlineClosed('2026-11-03', '2026-11-04', false), true);
  assert.equal(isDeadlineClosed('2026-11-03', '2026-11-03', false), false);
  assert.equal(isDeadlineClosed('2026-11-03', '2026-11-05', true), true);
});

test('calculateStreak (migration tooling wrapper) agrees with replay', () => {
  const days = requiredDays(MON, 9);
  assert.equal(calculateStreak(days, addDays(days.at(-1), 1)), 9);
});
