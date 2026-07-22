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
 */
export function calculateStreak(submittedDates, todayStr, now = new Date()) {
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

/** Call right after a Daily Scores submission to update streak_count / shields. */
export function applySubmission({ streakCount, streakShields, submittedDates, dateJustSubmitted, now = new Date() }) {
  const todayStr = ptDateString(now);

  if (ptDayOfWeek(dateJustSubmitted) === 0) {
    // Sunday submissions are welcome but never change the streak.
    return { streakCount, streakShields, earnedShield: false };
  }

  const dates = submittedDates.includes(dateJustSubmitted)
    ? submittedDates
    : [...submittedDates, dateJustSubmitted];
  const newStreak = calculateStreak(dates, todayStr, now);

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
export function reconcileUserStreak({ user, submittedDates, now = new Date() }) {
  const todayStr = ptDateString(now);
  const dow = ptDayOfWeek(todayStr);

  // Sunday: never runs. Monday: never runs (Monday's own deadline is Tuesday
  // noon, so there's nothing to enforce yet).
  if (dow === 0 || dow === 1) {
    const correct = calculateStreak(submittedDates, todayStr, now);
    if (correct !== user.streak_count) {
      return { action: 'sync', streakCount: correct };
    }
    return { action: 'none' };
  }

  // Tuesday must reach back to Monday (hopping over the always-skipped Sunday
  // check-day); Wed-Sat check yesterday.
  const requiredDate = dow === 2 ? addDays(todayStr, -2) : addDays(todayStr, -1);
  const submittedRequired = submittedDates.includes(requiredDate);
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

  const correct = calculateStreak(submittedDates, todayStr, now);
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
