import { ptDateString, ptDayOfWeek, addDays, isBeforeNoonPT } from '../config/pacificTime.js';

const MAX_SHIELDS = 3;
const SHIELD_INTERVAL_DAYS = 7;
const RECOVERY_WINDOW_HOURS = 24;
// Hard ceiling on how many calendar days one replay may walk — far beyond
// any real program history, only here so a corrupt input can never loop
// unboundedly.
const MAX_REPLAY_DAYS = 3660;

/**
 * THE canonical streak + shield engine for Inspire Daily (2026-10-04
 * stability rebuild). Every screen, the submission route, the noon-PT cron,
 * the per-request catch-up, and every repair script resolve streak/shield
 * state through `replayStreak` — nothing else implements streak math.
 *
 * It is a deterministic CHRONOLOGICAL REPLAY: start from a baseline (a
 * Base44/admin checkpoint, or nothing), then walk every calendar day in
 * order up to "now", applying the program rules day by day:
 *
 *   - Sunday: protected rest day. Never required, never counts, never
 *     breaks, never earns or consumes a shield — even if a row exists.
 *   - Submitted required day: streak +1, shield-earning progress +1. Every
 *     7th consecutive completion earns 1 shield (max 3). A completed block
 *     at 3/3 earns nothing and nothing is banked.
 *   - Unsubmitted required day whose window is still open (deadline: noon
 *     PT the next calendar day): pending — not counted, not missed.
 *   - Unsubmitted required day whose window has closed: a miss. If there is
 *     an ongoing streak and a shield, exactly one shield is consumed, the
 *     streak is preserved (not incremented), and earning progress restarts.
 *     With no shield, the streak resets to 0.
 *
 * Why replay instead of the previous "recompute from history + whatever
 * shields the user holds right now" design: that design was not
 * monotonic in time. A shield earned on Sep 23 could be spent on a gap from
 * Sep 11 that had ALREADY reset the streak two weeks earlier, silently
 * resurrecting an old, broken chain — confirmed as the exact cause of Nelli
 * Holland's ~+10 jump (16 -> 26, shields 2 -> 0) and Samuel Freeman's
 * retroactive shield losses. In a replay, the shields available on any given
 * day are only the ones earned BEFORE that day, so a later shield can never
 * reach back into the past. Same inputs -> same output, every time: running
 * it 1 or 100 times changes nothing (idempotent by construction).
 *
 * @param {object} p
 * @param {string[]} p.submittedDates - 'YYYY-MM-DD' daily_scores dates (any order; duplicates ignored).
 * @param {{date: string, streak: number, shields?: number}|null} p.baseline -
 *   checkpoint baseline: "as of `date` (inclusive) the streak was `streak`".
 *   Applied exactly once, as the starting state; real rows on/before
 *   `date` are already represented by it and are never counted again.
 *   Shields at baseline default to 0 — no verified shield inventory was
 *   ever migrated, and a migrated streak length never implies shields.
 * @param {string} p.today - current PT date 'YYYY-MM-DD'.
 * @param {boolean} p.beforeNoon - whether it is currently before 12:00 PM PT.
 * @returns {{
 *   streak: number, shields: number, progress: number,
 *   lastContinuityDate: string|null,
 *   events: {type: 'earned'|'consumed'|'reset', date: string, streakValue: number}[],
 *   pendingDates: string[], countedDates: string[],
 * }}
 */
export function replayStreak({ submittedDates, baseline = null, today, beforeNoon }) {
  const submitted = new Set(submittedDates);
  const events = [];
  const pendingDates = [];
  const countedDates = [];

  let streak = 0;
  let shields = 0;
  let progress = 0;
  let lastContinuityDate = null;
  let cursor;

  if (baseline) {
    streak = Math.max(0, Number(baseline.streak) || 0);
    shields = clampShields(Number(baseline.shields) || 0);
    lastContinuityDate = streak > 0 ? baseline.date : null;
    cursor = addDays(baseline.date, 1);
  } else {
    const sorted = [...submitted].sort();
    if (sorted.length === 0) {
      return { streak: 0, shields: 0, progress: 0, lastContinuityDate: null, events, pendingDates, countedDates };
    }
    cursor = sorted[0];
  }

  for (let i = 0; cursor <= today && i < MAX_REPLAY_DAYS; i++, cursor = addDays(cursor, 1)) {
    if (ptDayOfWeek(cursor) === 0) continue; // Sunday: never required, never counts.

    if (submitted.has(cursor)) {
      streak += 1;
      progress += 1;
      lastContinuityDate = cursor;
      countedDates.push(cursor);
      if (progress >= SHIELD_INTERVAL_DAYS) {
        progress = 0;
        if (shields < MAX_SHIELDS) {
          shields += 1;
          events.push({ type: 'earned', date: cursor, streakValue: streak });
        }
      }
      continue;
    }

    if (!isDeadlineClosed(cursor, today, beforeNoon)) {
      pendingDates.push(cursor);
      continue;
    }

    // A real, closed miss.
    if (streak > 0 && shields > 0) {
      shields -= 1;
      progress = 0;
      lastContinuityDate = cursor;
      events.push({ type: 'consumed', date: cursor, streakValue: streak });
    } else if (streak > 0) {
      events.push({ type: 'reset', date: cursor, streakValue: streak });
      streak = 0;
      progress = 0;
      lastContinuityDate = null;
    } else {
      progress = 0;
    }
  }

  return { streak, shields, progress, lastContinuityDate, events, pendingDates, countedDates };
}

/** A day's submission window closes at 12:00 PM PT on the next calendar
 * day (Saturday's at Sunday noon, Monday's at Tuesday noon, etc.). Pure
 * string comparison on PT dates + the current noon flag — DST-safe. */
export function isDeadlineClosed(date, today, beforeNoon) {
  const deadlineDay = addDays(date, 1);
  if (today > deadlineDay) return true;
  if (today < deadlineDay) return false;
  return !beforeNoon;
}

function clampShields(n) {
  return Math.min(MAX_SHIELDS, Math.max(0, n));
}

/** A base44_checkpoints row -> replay baseline (or null). */
export function baselineFromCheckpoint(checkpointRow) {
  if (!checkpointRow) return null;
  return {
    date: checkpointRow.checkpoint_date ?? checkpointRow.checkpointDate,
    streak: checkpointRow.streak_checkpoint ?? checkpointRow.streakCheckpoint,
    shields: 0,
  };
}

/** `now` (a Date) -> the {today, beforeNoon} pair replayStreak needs. */
export function clockFrom(now = new Date()) {
  return { today: ptDateString(now), beforeNoon: isBeforeNoonPT(now) };
}

/**
 * Streak number only, for the one-off Base44 migration tooling under
 * server/scripts (dry-run/import/estimate), which evaluates historical
 * dates. Same canonical replay underneath — just returns the number.
 * `todayStr` may be a past date; when it isn't today, it's evaluated as of
 * after noon on that day.
 */
export function calculateStreak(submittedDates, todayStr, now = new Date(), checkpoint = null) {
  const today = todayStr || ptDateString(now);
  const beforeNoon = today === ptDateString(now) ? isBeforeNoonPT(now) : false;
  return replayStreak({ submittedDates, baseline: baselineFromCheckpoint(checkpoint), today, beforeNoon }).streak;
}

export const STREAK_CONSTANTS = { MAX_SHIELDS, SHIELD_INTERVAL_DAYS, RECOVERY_WINDOW_HOURS };
