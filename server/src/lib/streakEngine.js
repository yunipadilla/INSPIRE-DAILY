import { ptDateString, ptDayOfWeek, addDays, isBeforeNoonPT } from '../config/pacificTime.js';

const MAX_LOOKBACK_DAYS = 400;
const MAX_SHIELDS = 3;
const SHIELD_INTERVAL_DAYS = 7;
const RECOVERY_WINDOW_HOURS = 24;

/**
 * The single canonical streak calculation — shield-aware by construction.
 *
 * Before the 2026-09-16 shield rebuild, shield protection lived ONLY in
 * reconcileUserStreak (the noon-PT reconciliation path), while a real
 * Daily Score submission (applySubmission) recomputed the streak through a
 * plain, shield-blind backward walk. Those two paths raced: if a user's own
 * next submission reached a missed required day BEFORE reconciliation had
 * gotten to it, the plain walk broke the streak on the spot with no shield
 * ever consulted or consumed — confirmed as the actual mechanism behind a
 * production incident where a shield was available but a user's streak
 * still silently reset. Making shield-bridging part of THIS one function
 * closes that race by construction: submission and reconciliation now call
 * the exact same logic and can never disagree about whether a shield
 * should have applied.
 *
 * Rule: submit Daily Scores by 12:00 PM Pacific Time the day after `date`.
 * Sunday is always a rest day — it neither counts toward nor breaks a
 * streak, submitted or not, consumes no shield, and is never itself a
 * candidate for shield-bridging. Walking backward from today, a gap breaks
 * the streak UNLESS it falls within the still-open submission window
 * (today itself, or yesterday before noon PT today) OR the streak already
 * has momentum (has started) and a shield is available to bridge it —
 * shields only ever protect an ONGOING streak, never manufacture one from
 * nothing.
 *
 * @param {string[]} submittedDates - 'YYYY-MM-DD' dates the user has submitted, any order.
 * @param {string} todayStr - 'YYYY-MM-DD', the current date in Pacific Time.
 * @param {Date} now - current instant (for the before-noon check); defaults to real now.
 * @param {{checkpointDate: string, streakCheckpoint: number}|null} checkpoint -
 *   an approved Base44 transition baseline (see repositories/base44Checkpoints.js).
 *   Absent/null for every user without one. When present, the streak is
 *   computed as checkpoint forward-continuity instead of the backward walk.
 * @param {number} availableShields - shields the user currently holds (0-3).
 *   Pass 0 to get the old, shield-blind result exactly (calculateStreak()
 *   below is a thin wrapper doing exactly that, for callers that only need
 *   the number and don't need to know about shield consumption).
 * @param {string[]} previouslyBridgedDates - dates a shield has ALREADY
 *   covered, from a prior reconciliation or submission (see
 *   repositories/streakShieldEvents.js's listBridgedDatesForUser). Without
 *   this, every fresh call re-derives the streak from checkpoint/real dates
 *   plus whatever shields happen to be available RIGHT NOW — so a date
 *   bridged by a shield that has since been spent would look like a brand
 *   new, unprotected gap the next time anything reconciles, forfeiting the
 *   streak all over again even though nothing new actually happened. A
 *   previously-bridged date is treated exactly like a real submission for
 *   continuity (it does not re-consume a shield, and does not add to the
 *   count for the missed day itself, same as when it was first bridged).
 * @returns {{streak: number, shieldsUsed: number, bridgedDates: string[]}}
 *   `bridgedDates` here is only the NEWLY bridged dates from this call, not
 *   previouslyBridgedDates echoed back — callers use it to know which new
 *   ledger rows (if any) to write.
 */
export function calculateStreakWithShields(submittedDates, todayStr, now = new Date(), checkpoint = null, availableShields = 0, previouslyBridgedDates = []) {
  const bridged = new Set(previouslyBridgedDates);
  if (checkpoint) {
    return walkForwardFromCheckpointWithShields(checkpoint, submittedDates, todayStr, now, availableShields, bridged);
  }
  return walkBackwardWithShields(submittedDates, todayStr, now, availableShields, bridged);
}

function walkBackwardWithShields(submittedDates, todayStr, now, availableShields, bridged = new Set()) {
  const submitted = new Set(submittedDates);
  const yesterdayStr = addDays(todayStr, -1);
  const beforeNoon = isBeforeNoonPT(now);

  let current = todayStr;
  let streak = 0;
  let started = false;
  let shieldsRemaining = availableShields;
  let shieldsUsed = 0;
  const bridgedDates = [];

  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const dow = ptDayOfWeek(current);

    if (dow === 0) {
      // Sunday: rest day, always skipped, never breaks/extends/consumes.
      current = addDays(current, -1);
      continue;
    }

    if (submitted.has(current)) {
      streak += 1;
      started = true;
    } else if (bridged.has(current)) {
      // Already resolved by a shield in a PRIOR reconciliation/submission —
      // permanently covered continuity, never re-litigated, never a second
      // shield spent on the same date. A date only ever enters this set
      // after having been bridged while an ongoing streak was already in
      // progress (see reconcileUserStreak/applySubmission), so encountering
      // it here always means real continuity continues through it.
      started = true;
    } else if (!started && current === todayStr) {
      // Today's own submission window is still open — don't penalize yet.
    } else if (!started && current === yesterdayStr && beforeNoon) {
      // Yesterday's deadline is today at noon — window still open.
    } else if (started && shieldsRemaining > 0) {
      // A real, confirmed gap on an already-ongoing streak, with a shield
      // available — bridge it. The missed day itself never counts toward
      // the streak; continuity simply continues past it.
      shieldsRemaining -= 1;
      shieldsUsed += 1;
      bridgedDates.push(current);
    } else {
      break;
    }

    current = addDays(current, -1);
  }

  return { streak, shieldsUsed, bridgedDates };
}

/**
 * Checkpoint-aware version of the same walk, forward from the day after
 * checkpointDate. A gap that exhausts available shields forfeits the
 * checkpoint exactly as before — falling back to the plain backward walk
 * over real submittedDates only — except any shields already spent
 * bridging earlier gaps within this same walk stay spent (never refunded)
 * and the fallback walk continues from the shields that remain.
 */
function walkForwardFromCheckpointWithShields(checkpoint, submittedDates, todayStr, now, availableShields, bridged = new Set()) {
  const submitted = new Set(submittedDates);
  const yesterdayStr = addDays(todayStr, -1);
  const beforeNoon = isBeforeNoonPT(now);

  let current = addDays(checkpoint.checkpointDate, 1);
  let addOn = 0;
  let shieldsRemaining = availableShields;
  let shieldsUsed = 0;
  const bridgedDates = [];

  while (current <= todayStr) {
    const dow = ptDayOfWeek(current);
    if (dow === 0) {
      current = addDays(current, 1);
      continue;
    }
    if (submitted.has(current)) {
      addOn += 1;
    } else if (bridged.has(current)) {
      // Already resolved by a shield previously — covered, no re-consumption.
    } else if (current === todayStr) {
      // Today's own window still open — don't break the chain yet.
    } else if (current === yesterdayStr && beforeNoon) {
      // Yesterday's window still open (closes at today's noon).
    } else if (shieldsRemaining > 0) {
      shieldsRemaining -= 1;
      shieldsUsed += 1;
      bridgedDates.push(current);
    } else {
      const fallback = walkBackwardWithShields(submittedDates, todayStr, now, shieldsRemaining, bridged);
      return {
        streak: fallback.streak,
        shieldsUsed: shieldsUsed + fallback.shieldsUsed,
        bridgedDates: [...bridgedDates, ...fallback.bridgedDates],
      };
    }
    current = addDays(current, 1);
  }

  return { streak: checkpoint.streakCheckpoint + addOn, shieldsUsed, bridgedDates };
}

/** Shield-blind streak number only — for callers that genuinely don't need
 * shield-consumption information (e.g. a read-only display recomputation).
 * Equivalent to calculateStreakWithShields(..., 0 shields available), since
 * zero shields can never bridge a gap, so this is always identical to the
 * true value whenever the caller's own available-shields count is 0 too. */
export function calculateStreak(submittedDates, todayStr, now = new Date(), checkpoint = null) {
  return calculateStreakWithShields(submittedDates, todayStr, now, checkpoint, 0).streak;
}

/**
 * Shield-earning progress is tracked against an explicit anchor (the streak
 * value shields were last evaluated from — see `shieldProgressAnchor` on
 * `users`), never `streak % 7 === 0` on the raw absolute streak number.
 * Those two are NOT equivalent the moment a shield has ever been consumed:
 * consuming a shield at streak 99 must require 7 FRESH days from 99 (i.e.
 * a shield back at streak 106), but 99 isn't a multiple of 7, so a
 * modulo-on-absolute-streak check would instead fire early at 105 (only 6
 * fresh days) purely because 105 happens to be divisible by 7 — an
 * accident of the starting number, not a real 7-day block. Anchoring
 * explicitly is what makes re-earning and idempotent one-shield-per-
 * real-block earning both correct.
 */
function advanceShieldProgress(newStreak, streakShields, anchor) {
  let shields = streakShields;
  let progressAnchor = anchor;
  let earnedShield = false;
  while (newStreak - progressAnchor >= SHIELD_INTERVAL_DAYS && shields < MAX_SHIELDS) {
    shields += 1;
    progressAnchor += SHIELD_INTERVAL_DAYS;
    earnedShield = true;
  }
  return { shields, progressAnchor, earnedShield };
}

/**
 * Call right after a Daily Scores submission to update streak_count /
 * shields. `checkpoint` (see repositories/base44Checkpoints.js) is optional
 * and absent for the vast majority of users. `shieldProgressAnchor`
 * (nullable) is the streak value shield-earning was last evaluated from;
 * when null, it defaults to the PRE-submission streak count — earning
 * starts counting fresh from wherever the user already is rather than
 * retroactively crediting untracked history.
 *
 * Uses calculateStreakWithShields — a submission that lands after an
 * unprotected-until-now gap correctly consumes a shield right here, in the
 * same call that computes and returns the new streak, rather than leaving
 * that to a separate reconciliation pass that might not run before the
 * user's OWN next submission would otherwise silently break the streak.
 */
export function applySubmission({ streakCount, streakShields, submittedDates, dateJustSubmitted, now = new Date(), checkpoint = null, shieldProgressAnchor = null, previouslyBridgedDates = [] }) {
  const todayStr = ptDateString(now);

  if (ptDayOfWeek(dateJustSubmitted) === 0) {
    // Sunday submissions are welcome but never change the streak or shields.
    return { streakCount, streakShields, earnedShield: false, shieldProgressAnchor: shieldProgressAnchor ?? streakCount, shieldsUsed: 0, bridgedDates: [] };
  }

  const dates = submittedDates.includes(dateJustSubmitted)
    ? submittedDates
    : [...submittedDates, dateJustSubmitted];
  const { streak: newStreak, shieldsUsed, bridgedDates } = calculateStreakWithShields(dates, todayStr, now, checkpoint, streakShields, previouslyBridgedDates);
  const shieldsAfterConsumption = streakShields - shieldsUsed;

  const anchor = shieldsUsed > 0
    ? newStreak // a shield was just spent protecting this streak — re-earning counts fresh from here (see advanceShieldProgress's doc comment).
    : (shieldProgressAnchor ?? streakCount);
  const { shields: newShields, progressAnchor, earnedShield } = advanceShieldProgress(newStreak, shieldsAfterConsumption, anchor);

  return { streakCount: newStreak, streakShields: newShields, earnedShield, shieldProgressAnchor: progressAnchor, shieldsUsed, bridgedDates };
}

/**
 * Nightly-job-equivalent reconciliation for one user, run by the noon-PT
 * cron (see server/src/agents/dailyScoresAgent.js) and opportunistically on
 * a user's own next authenticated request (see middleware/auth.js — Render's
 * free tier suspends the process when idle, so the cron alone can't be
 * trusted to run every day). Enforcement genuinely happens at noon, not
 * midnight — that's the moment the "submit by noon the following day"
 * deadline actually closes; running this at midnight would cut every
 * user's grace period in half.
 */
export function reconcileUserStreak({ user, submittedDates, now = new Date(), checkpoint = null, previouslyBridgedDates = [] }) {
  const todayStr = ptDateString(now);
  const dow = ptDayOfWeek(todayStr);
  const beforeNoon = isBeforeNoonPT(now);
  const stored = user.streak_count || 0;
  const shields = user.streak_shields || 0;

  // Sunday: never enforces. Monday: never enforces (Monday's own deadline is
  // Tuesday noon, so there's nothing due yet). Every other day's "yesterday"
  // deadline closes at today's noon PT — but only once noon has actually
  // passed; before noon, yesterday's catch-up window is still open, so
  // nothing below may be treated as a confirmed miss yet. All three cases
  // fall through to the same honest, shield-aware sync — never a forced
  // reset/consumption before a deadline has genuinely closed (see the
  // 2026-09-09 incident this guarded against: an off-schedule call before
  // noon PT reset an otherwise-legitimate checkpointed streak to 0).
  //
  // previouslyBridgedDates (see repositories/streakShieldEvents.js) is what
  // makes repeated reconciliation idempotent: without it, a date a shield
  // already covered in an earlier pass would look like a brand-new,
  // unprotected gap the moment that shield's count is no longer available
  // to "explain" it, forfeiting the streak all over again for no new reason
  // (confirmed as a real bug during this rebuild's own verification).
  const result = calculateStreakWithShields(submittedDates, todayStr, now, checkpoint, shields, previouslyBridgedDates);

  if (dow === 0 || dow === 1 || beforeNoon) {
    if (result.streak === stored && result.shieldsUsed === 0) return { action: 'none' };
    return syncOutcome(result, shields, stored);
  }

  if (result.shieldsUsed > 0) {
    // At least one required day was genuinely missed and bridged by a
    // shield — streak preserved (not incremented for the missed day, not
    // reset), shields decremented, earning progress restarts from here.
    return {
      action: 'shield_consumed',
      streakCount: result.streak,
      streakShields: shields - result.shieldsUsed,
      streakLastDate: result.bridgedDates[result.bridgedDates.length - 1],
      shieldProgressAnchor: result.streak,
      bridgedDates: result.bridgedDates,
    };
  }

  if (result.streak < stored) {
    // A genuine, unprotectable drop — no shield was available to cover it.
    // Sync to the true value (which may be a small positive number from
    // real subsequent activity, not necessarily exactly 0) and open the
    // 24-hour recovery-acknowledgement window, same as before.
    const recoveryUntil = new Date(now.getTime() + RECOVERY_WINDOW_HOURS * 60 * 60 * 1000);
    return {
      action: 'reset',
      streakCount: result.streak,
      streakLastDate: result.streak > 0 ? todayStr : null,
      recoveryAvailableUntil: recoveryUntil.toISOString(),
      recoveryPriorCount: stored,
      shieldProgressAnchor: result.streak,
    };
  }

  if (result.streak !== stored) return syncOutcome(result, shields, stored);
  return { action: 'none' };
}

function syncOutcome(result, shields) {
  return {
    action: 'sync',
    streakCount: result.streak,
    ...(result.shieldsUsed > 0
      ? {
          streakShields: shields - result.shieldsUsed,
          shieldProgressAnchor: result.streak,
          bridgedDates: result.bridgedDates,
          streakLastDate: result.bridgedDates[result.bridgedDates.length - 1],
        }
      : {}),
  };
}

/** Consume a shield manually (e.g. user opts in via the "use a shield?" popup). */
export function useShield({ streakShields }) {
  return { streakShields: Math.max(0, streakShields - 1) };
}

export const STREAK_CONSTANTS = { MAX_SHIELDS, SHIELD_INTERVAL_DAYS, RECOVERY_WINDOW_HOURS };
