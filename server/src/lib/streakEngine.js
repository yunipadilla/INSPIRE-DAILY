import { ptDateString, ptDayOfWeek, addDays, isBeforeNoonPT } from '../config/pacificTime.js';

const MAX_LOOKBACK_DAYS = 400;
const MAX_SHIELDS = 3;
const SHIELD_INTERVAL_DAYS = 7;
const RECOVERY_WINDOW_HOURS = 24;

/**
 * The single canonical streak calculation, used by the submission endpoint,
 * the noon reconciliation job, and the admin recalculate tool alike.
 *
 * Rule: submit Daily Scores by 12:00 PM Pacific Time the day after `date`.
 * Sunday is always a rest day — it neither counts toward nor breaks a streak,
 * submitted or not. Walking backward from today, a gap breaks the streak
 * UNLESS it falls within the still-open submission window: today itself
 * (window open until tomorrow noon) or yesterday before noon PT today
 * (yesterday's own window, which closes at today's noon).
 *
 * @param {string[]} submittedDates - 'YYYY-MM-DD' dates the user has submitted, any order.
 * @param {string} todayStr - 'YYYY-MM-DD', the current date in Pacific Time.
 * @param {Date} now - current instant (for the before-noon check); defaults to real now.
 * @param {{checkpointDate: string, streakCheckpoint: number}|null} checkpoint -
 *   an approved Base44 transition baseline (see repositories/base44Checkpoints.js).
 *   Absent/null for every user without one — behavior is then identical to
 *   before this parameter existed. When present, the streak is computed as
 *   checkpoint forward-continuity (see calculateStreakFromCheckpoint) instead
 *   of the backward walk below.
 */
export function calculateStreak(submittedDates, todayStr, now = new Date(), checkpoint = null) {
  if (checkpoint) {
    return calculateStreakFromCheckpoint(checkpoint, submittedDates, todayStr, now);
  }

  const submitted = new Set(submittedDates);
  const yesterdayStr = addDays(todayStr, -1);
  const beforeNoon = isBeforeNoonPT(now);

  let current = todayStr;
  let streak = 0;
  let started = false;

  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const dow = ptDayOfWeek(current);

    if (dow === 0) {
      // Sunday: rest day, always skipped, never breaks or extends the streak.
      current = addDays(current, -1);
      continue;
    }

    if (submitted.has(current)) {
      streak += 1;
      started = true;
    } else if (!started && current === todayStr) {
      // Today's own submission window is still open — don't penalize yet.
    } else if (!started && current === yesterdayStr && beforeNoon) {
      // Yesterday's deadline is today at noon — window still open.
    } else {
      break;
    }

    current = addDays(current, -1);
  }

  return streak;
}

/**
 * Checkpoint-aware streak: walks FORWARD from the day after checkpointDate,
 * mirroring the same Sunday-skip and still-open-window rules as the
 * backward walk above, adding one for each real post-checkpoint submission.
 * The moment a required non-Sunday day is missed outside its grace window,
 * the checkpoint is forfeited for good — this call falls back to the plain
 * backward-walk calculateStreak() over the real submittedDates only, i.e.
 * "reset according to canonical streak rules" exactly as specified. A
 * checkpoint can only ever ADD verified continuity on top of real activity;
 * it can never mask a real, subsequent gap.
 */
function calculateStreakFromCheckpoint(checkpoint, submittedDates, todayStr, now) {
  const submitted = new Set(submittedDates);
  const yesterdayStr = addDays(todayStr, -1);
  const beforeNoon = isBeforeNoonPT(now);

  let current = addDays(checkpoint.checkpointDate, 1);
  let addOn = 0;

  while (current <= todayStr) {
    const dow = ptDayOfWeek(current);
    if (dow === 0) {
      current = addDays(current, 1);
      continue;
    }
    if (submitted.has(current)) {
      addOn += 1;
    } else if (current === todayStr) {
      // Today's own window still open — don't break the chain yet.
    } else if (current === yesterdayStr && beforeNoon) {
      // Yesterday's window still open (closes at today's noon).
    } else {
      // Checkpoint continuity broken by a real, unsubmitted eligible day —
      // forfeit the checkpoint permanently, canonical rules take over.
      return calculateStreak(submittedDates, todayStr, now, null);
    }
    current = addDays(current, 1);
  }

  return checkpoint.streakCheckpoint + addOn;
}

/** Call right after a Daily Scores submission to update streak_count / shields.
 * `checkpoint` (see repositories/base44Checkpoints.js) is optional and
 * absent for the vast majority of users — passing it through here is what
 * lets a checkpointed user's post-submission streak correctly include their
 * approved Base44 baseline instead of only counting rebuilt-platform rows. */
export function applySubmission({ streakCount, streakShields, submittedDates, dateJustSubmitted, now = new Date(), checkpoint = null }) {
  const todayStr = ptDateString(now);

  if (ptDayOfWeek(dateJustSubmitted) === 0) {
    // Sunday submissions are welcome but never change the streak.
    return { streakCount, streakShields, earnedShield: false };
  }

  const dates = submittedDates.includes(dateJustSubmitted)
    ? submittedDates
    : [...submittedDates, dateJustSubmitted];
  const newStreak = calculateStreak(dates, todayStr, now, checkpoint);

  let newShields = streakShields;
  let earnedShield = false;
  if (newStreak > 0 && newStreak % SHIELD_INTERVAL_DAYS === 0 && newShields < MAX_SHIELDS) {
    newShields += 1;
    earnedShield = true;
  }

  return { streakCount: newStreak, streakShields: newShields, earnedShield };
}

/**
 * Nightly-job-equivalent reconciliation for one user, run by the noon-PT
 * cron (see server/src/agents/dailyScoresAgent.js). Enforcement genuinely
 * happens at noon, not midnight — that's the moment the "submit by noon
 * the following day" deadline actually closes; running this at midnight
 * would cut every user's grace period in half.
 */
export function reconcileUserStreak({ user, submittedDates, now = new Date(), checkpoint = null }) {
  const todayStr = ptDateString(now);
  const dow = ptDayOfWeek(todayStr);
  const beforeNoon = isBeforeNoonPT(now);

  // Sunday: never runs. Monday: never runs (Monday's own deadline is Tuesday
  // noon, so there's nothing to enforce yet). Every other day's "yesterday"
  // deadline closes at today's noon PT — but only once noon has actually
  // passed. Before noon, yesterday's catch-up window is still open (the same
  // grace period calculateStreak/calculateStreakFromCheckpoint already honor
  // for their own backward/forward walks), so nothing below this line may be
  // treated as a confirmed miss yet. Falling through to the same plain sync
  // as Sunday/Monday is what keeps a call made off the exact noon cron
  // schedule (e.g. an ad-hoc admin recalculation run first thing in the
  // morning) from firing a premature reset or burning a shield on a day the
  // user still has hours left to submit — see the 2026-09-09 production
  // streak-repair incident, where exactly this off-schedule-before-noon call
  // reset an otherwise-legitimate checkpointed streak to 0.
  if (dow === 0 || dow === 1 || beforeNoon) {
    const correct = calculateStreak(submittedDates, todayStr, now, checkpoint);
    if (correct !== user.streak_count) {
      return { action: 'sync', streakCount: correct };
    }
    return { action: 'none' };
  }

  // Yesterday is always the one newly-closed deadline as of today's noon.
  // (This used to special-case Tuesday as addDays(todayStr, -2) to "hop over"
  // Sunday, but that actually landed the required-date check ON Sunday —
  // a day nobody is ever required or expected to submit — which would have
  // incorrectly reset every non-checkpointed user's streak every single
  // Tuesday. Sunday is never a required day and must never be checked here;
  // plain "yesterday" is correct for every enforcing day, Tuesday included,
  // since Monday's own deadline is exactly today-at-noon-on-Tuesday.)
  const requiredDate = addDays(todayStr, -1);
  // A required date on or before an approved checkpoint is already certified
  // by the checkpoint itself — it must never be treated as "missed" just
  // because no literal rebuilt-platform row exists for that date.
  const submittedRequired = checkpoint && requiredDate <= checkpoint.checkpointDate
    ? true
    : submittedDates.includes(requiredDate);
  const stored = user.streak_count || 0;

  if (!submittedRequired && stored > 0) {
    if (user.streak_shields > 0) {
      return {
        action: 'shield_consumed',
        streakShields: user.streak_shields - 1,
        streakLastDate: requiredDate,
      };
    }
    const recoveryUntil = new Date(now.getTime() + RECOVERY_WINDOW_HOURS * 60 * 60 * 1000);
    return {
      action: 'reset',
      streakCount: 0,
      streakLastDate: null,
      recoveryAvailableUntil: recoveryUntil.toISOString(),
      recoveryPriorCount: stored,
    };
  }

  const correct = calculateStreak(submittedDates, todayStr, now, checkpoint);
  if (correct !== stored) {
    return { action: 'sync', streakCount: correct };
  }
  return { action: 'none' };
}

/** Consume a shield manually (e.g. user opts in via the "use a shield?" popup). */
export function useShield({ streakShields }) {
  return { streakShields: Math.max(0, streakShields - 1) };
}

export const STREAK_CONSTANTS = { MAX_SHIELDS, SHIELD_INTERVAL_DAYS, RECOVERY_WINDOW_HOURS };
