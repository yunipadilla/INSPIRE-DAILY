// Standalone, deterministic test matrix for the rebuilt shield engine (cases
// A-K from the shield-system rebuild task). No DB — pure function calls
// against streakEngine.js, using fixed dates so results are reproducible.
import { applySubmission, calculateStreak, reconcileUserStreak, STREAK_CONSTANTS } from '../src/lib/streakEngine.js';
import { addDays, ptDayOfWeek } from '../src/config/pacificTime.js';

let pass = 0;
let fail = 0;
function assertEq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} -> actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  if (ok) pass += 1; else fail += 1;
}

// Helper: submit N consecutive REQUIRED days starting the day after `start`,
// skipping Sundays (they're never required and never submitted here),
// threading state (streak/shields/anchor/dates) through applySubmission
// exactly as the real submission route does. `state.checkpoint`, when set,
// represents a pre-existing streak baseline (exactly how a real high-streak
// user's continuity is actually represented in this app) -- calculateStreak
// itself is a pure function of submittedDates/checkpoint, so a nonzero
// "starting streak" in a test MUST be backed by either real prior dates or
// a checkpoint; there is no other way to make it real.
function submitConsecutiveRequiredDays(state, count, startDate) {
  let cur = startDate;
  let submitted = 0;
  const events = [];
  while (submitted < count) {
    cur = addDays(cur, 1);
    if (ptDayOfWeek(cur) === 0) continue; // Sunday: not required, don't submit
    const now = new Date(`${addDays(cur, 1)}T20:00:00.000Z`); // well within the next day's window, before that day's noon-PT deadline
    const result = applySubmission({
      streakCount: state.streakCount,
      streakShields: state.streakShields,
      submittedDates: state.dates,
      dateJustSubmitted: cur,
      now,
      checkpoint: state.checkpoint ?? null,
      shieldProgressAnchor: state.anchor,
    });
    state.dates = [...state.dates, cur];
    state.streakCount = result.streakCount;
    state.streakShields = result.streakShields;
    state.anchor = result.shieldProgressAnchor;
    events.push({ date: cur, ...result });
    submitted += 1;
  }
  return events;
}

console.log('=== A: 0 shields, 7 consecutive required completions => 1/3 ===');
{
  const state = { streakCount: 0, streakShields: 0, anchor: null, dates: [] };
  const events = submitConsecutiveRequiredDays(state, 7, '2026-11-01'); // Sunday, so day 1 submitted is Nov 2 (Mon)
  assertEq('A: final shields', state.streakShields, 1);
  assertEq('A: streak after 7 required days', state.streakCount, 7);
  assertEq('A: exactly one earnedShield=true event', events.filter((e) => e.earnedShield).length, 1);
}

// B/C/D each represent "the user already has a real streak of N" -- since
// calculateStreak is a pure function of submittedDates/checkpoint (never of
// a bare number), that starting streak must be backed by a checkpoint
// baseline exactly as a real long-streak user's continuity actually is.
console.log('=== B: 1 shield, next 7 required completions => 2/3 ===');
{
  const checkpoint = { checkpointDate: '2026-11-08', streakCheckpoint: 7 }; // Sunday anchor
  const state = { streakCount: 7, streakShields: 1, anchor: 7, dates: [], checkpoint };
  submitConsecutiveRequiredDays(state, 7, '2026-11-08');
  assertEq('B: final shields', state.streakShields, 2);
}

console.log('=== C: 2 shields, next 7 required completions => 3/3 ===');
{
  const checkpoint = { checkpointDate: '2026-11-15', streakCheckpoint: 14 };
  const state = { streakCount: 14, streakShields: 2, anchor: 14, dates: [], checkpoint };
  submitConsecutiveRequiredDays(state, 7, '2026-11-15');
  assertEq('C: final shields', state.streakShields, 3);
}

console.log('=== D: 3 shields, another 7 completions => stays 3/3 ===');
{
  const checkpoint = { checkpointDate: '2026-11-22', streakCheckpoint: 21 };
  const state = { streakCount: 21, streakShields: 3, anchor: 21, dates: [], checkpoint };
  submitConsecutiveRequiredDays(state, 7, '2026-11-22');
  assertEq('D: shields capped at max', state.streakShields, 3);
  assertEq('D: never exceeds MAX_SHIELDS', state.streakShields <= STREAK_CONSTANTS.MAX_SHIELDS, true);
}

// E/F/G/H: streak 99, N shields, miss a required day. Backed by a
// checkpoint (streak 99 as of the Monday before), same reasoning as B/C/D/K
// -- calculateStreakWithShields only bridges an ONGOING streak, so a bare
// `streak_count: 99` with zero backing history (no checkpoint, no real
// dates) correctly finds no momentum to protect and is not a valid test of
// this behavior.
function simulateMiss(shieldsBefore) {
  const checkpoint = { checkpointDate: '2026-11-23', streakCheckpoint: 99 }; // Monday
  const user = { streak_count: 99, streak_shields: shieldsBefore };
  const submittedDates = []; // Tuesday 11-24 (the required date) is simply absent
  const now = new Date('2026-11-25T21:00:00.000Z'); // Wed, unambiguously after noon PT
  return reconcileUserStreak({ user, submittedDates, now, checkpoint });
}

console.log('=== E: streak 99, 3 shields, miss => streak 99, shields 2/3 ===');
assertEq('E', simulateMiss(3), { action: 'shield_consumed', streakCount: 99, streakShields: 2, streakLastDate: '2026-11-24', shieldProgressAnchor: 99, bridgedDates: ['2026-11-24'] });

console.log('=== F: streak 99, 2 shields, miss => 99, 1/3 ===');
assertEq('F', simulateMiss(2), { action: 'shield_consumed', streakCount: 99, streakShields: 1, streakLastDate: '2026-11-24', shieldProgressAnchor: 99, bridgedDates: ['2026-11-24'] });

console.log('=== G: streak 99, 1 shield, miss => 99, 0/3 ===');
assertEq('G', simulateMiss(1), { action: 'shield_consumed', streakCount: 99, streakShields: 0, streakLastDate: '2026-11-24', shieldProgressAnchor: 99, bridgedDates: ['2026-11-24'] });

console.log('=== H: streak 99, 0 shields, miss => normal streak reset ===');
{
  const result = simulateMiss(0);
  assertEq('H: action', result.action, 'reset');
  assertEq('H: streak reset to 0', result.streakCount, 0);
  assertEq('H: anchor reset to 0', result.shieldProgressAnchor, 0);
}

console.log('=== I: Sunday occurs => no submission required, no shield consumed, streak protected ===');
{
  // "Today" is Monday -- reconcileUserStreak never enforces on Sunday/Monday
  // (Monday's own deadline is Tuesday noon; nothing newly due yet).
  const user = { streak_count: 50, streak_shields: 2 };
  const now = new Date('2026-11-30T20:00:00.000Z'); // Monday
  const result = reconcileUserStreak({ user, submittedDates: ['2026-11-27'], now, checkpoint: null });
  assertEq('I: no shield consumed on Sunday/Monday enforcement window', result.action !== 'shield_consumed' && result.action !== 'reset', true);
}

console.log('=== J: Shield consumed, then reconciliation agent runs repeatedly => shield NOT restored, streak NOT re-broken ===');
{
  // Realistic sequence: run 1 finds the gap and consumes a shield (as
  // dailyScoresAgent's reconcileOneUser would persist -- streak_shields
  // decremented, the bridged date written to streak_shield_events). Run 2
  // must then be given that SAME persisted state (lower shield count) AND
  // the now-recorded bridged date, exactly as a real second cron tick or a
  // second opportunistic per-request check would load them from the DB.
  //
  // This is the actual regression this rebuild caught against itself: an
  // earlier version without previouslyBridgedDates re-discovered the same
  // historical gap on run 2 with the shield already spent, forfeiting the
  // whole checkpoint and resetting a genuinely-protected streak to 0 --
  // confirmed against production data (Yuni Padilla / Grace Pohl,
  // 2026-09-16) before this fix.
  const checkpoint = { checkpointDate: '2026-11-23', streakCheckpoint: 99 };
  const now = new Date('2026-11-25T21:00:00.000Z');

  const user1 = { streak_count: 99, streak_shields: 2 };
  const r1 = reconcileUserStreak({ user: user1, submittedDates: [], now, checkpoint });
  assertEq('J: run 1 consumes exactly one shield and preserves the streak', { action: r1.action, streakCount: r1.streakCount, streakShields: r1.streakShields }, { action: 'shield_consumed', streakCount: 99, streakShields: 1 });

  // Persisted state after run 1, fed into run 2 -- same inputs a real
  // second tick would actually see.
  const user2 = { streak_count: r1.streakCount, streak_shields: r1.streakShields };
  const r2 = reconcileUserStreak({ user: user2, submittedDates: [], now, checkpoint, previouslyBridgedDates: r1.bridgedDates });
  assertEq('J: run 2 is a true no-op -- shield not restored, streak not re-broken', r2, { action: 'none' });
}

console.log('=== K: Shield consumed, then 7 new consecutive required completions => +1 shield ===');
{
  // Post-consumption state: streak preserved at 99, shields dropped to 2,
  // anchor reset to 99 (per E/F/G) -- represented as a checkpoint baseline,
  // same reasoning as B/C/D. Now simulate 7 fresh required-day completions
  // and confirm exactly one shield comes back.
  const checkpoint = { checkpointDate: '2026-11-24', streakCheckpoint: 99 };
  const state = { streakCount: 99, streakShields: 2, anchor: 99, dates: [], checkpoint };
  const events = submitConsecutiveRequiredDays(state, 7, '2026-11-24');
  assertEq('K: shields restored to 3 after 7 fresh required days', state.streakShields, 3);
  assertEq('K: exactly one shield earned in this block', events.filter((e) => e.earnedShield).length, 1);
}

console.log('=== L: submission-race regression — a user\'s OWN next submission, arriving before any reconciliation, must consume a shield instead of silently breaking the streak ===');
{
  // Reproduces the exact production case (Grace Pohl, 2026-09-16): a real
  // checkpointed streak, a missed required day whose grace window has
  // already closed, and NO reconciliation has run yet -- the user simply
  // submits their next real day. Before this fix, applySubmission called
  // the shield-blind calculateStreak() and this silently reset to a bare
  // count of 1, shield untouched. It must now protect the streak instead.
  const checkpoint = { checkpointDate: '2026-09-06', streakCheckpoint: 4 };
  const priorDates = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14']; // Sep 13 Sunday skipped, Sep 15 missing
  const result = applySubmission({
    streakCount: 11, // the correct pre-submission streak (checkpoint 4 + 7 real days)
    streakShields: 1,
    submittedDates: priorDates,
    dateJustSubmitted: '2026-09-16',
    now: new Date('2026-09-16T19:46:57.709Z'), // her actual submission instant, after noon PT
    checkpoint,
    shieldProgressAnchor: null,
  });
  assertEq('L: streak preserved and extended through the bridged gap (not reset to 1)', result.streakCount, 12);
  assertEq('L: shield consumed', result.streakShields, 0);
  assertEq('L: bridged exactly the missed date', result.bridgedDates, ['2026-09-15']);
}

console.log(`\n=== RESULTS: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
