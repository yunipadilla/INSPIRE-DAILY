// Canonical submission-window rule, shared by Daily Scores and Inspire
// Challenge — the ONLY place this rule is implemented. Both routes call
// these functions; neither reimplements its own cutoff math.
//
// Rule: a record for calendar date D may be submitted during D itself, or
// on D+1 up to and including 11:59:59 AM Pacific — the window closes at
// exactly 12:00:00 PM Pacific on D+1. Sunday itself never requires or
// accepts a submission (it's a protected rest day), but that is a fact
// about SUNDAY AS A SUBMISSION DATE, never about "today" — Saturday's own
// catch-up window must stay open through Sunday morning exactly like any
// other day-after window.
//
// 2026-09-06 hotfix: the previous version short-circuited the entire day to
// a rest state whenever *today* was Sunday, before ever checking whether
// Saturday's window was still open — i.e. it asked "is today Sunday?"
// before asking "is there a still-open prior-day window?", in the wrong
// order. That blocked legitimate Saturday catch-up submissions every Sunday
// morning and broke real participant streaks. Fixed by computing
// `yesterdayEligible` from yesterday's own weekday and the clock only —
// today's weekday is irrelevant to whether yesterday can still be
// submitted.
import { ptDateString, ptDayOfWeek, isBeforeNoonPT, addDays } from '../config/pacificTime.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const SUBMISSION_CUTOFF_LABEL = '12:00 PM Pacific Time';

/**
 * The full eligibility snapshot for "right now" — everything both the API
 * and the UI need to know which date(s) may be submitted and which should
 * be pre-selected.
 *
 * `state` names the single most relevant thing to show right now:
 *   - YESTERDAY_CATCHUP_AVAILABLE: yesterday's window is still open (this is
 *     true on an ordinary weekday before noon, AND on Sunday morning before
 *     noon when yesterday is Saturday).
 *   - REST_DAY_TODAY: today is Sunday and yesterday's window has closed —
 *     nothing is required or submittable today.
 *   - YESTERDAY_WAS_REST_DAY: yesterday was Sunday — no catch-up is offered
 *     for it (Sunday never accepts a submission, at any time), and the
 *     client should show a rest-day acknowledgement instead of silently
 *     asking for "yesterday's" reflection.
 *   - TODAY_REQUIRED: the ordinary case — submit for today.
 */
export function getSubmissionWindow(now = new Date()) {
  const today = ptDateString(now);
  const yesterday = addDays(today, -1);
  const beforeNoon = isBeforeNoonPT(now);
  const todayIsSunday = ptDayOfWeek(today) === 0;
  const yesterdayIsSunday = ptDayOfWeek(yesterday) === 0;

  // Whether yesterday can still be submitted depends only on yesterday's
  // own weekday and the clock — NOT on what today happens to be.
  const yesterdayEligible = !yesterdayIsSunday && beforeNoon;

  let state;
  if (yesterdayEligible) state = 'YESTERDAY_CATCHUP_AVAILABLE';
  else if (todayIsSunday) state = 'REST_DAY_TODAY';
  else if (yesterdayIsSunday) state = 'YESTERDAY_WAS_REST_DAY';
  else state = 'TODAY_REQUIRED';

  return {
    today,
    yesterday,
    beforeNoon,
    todayIsSunday,
    yesterdayIsSunday,
    yesterdayEligible,
    state,
    // Daily Scores/Challenge are primarily a reflection on the day just
    // finished — while yesterday is still open, it's the preferred choice;
    // once its window closes, today becomes the only sensible default.
    defaultDate: yesterdayEligible ? yesterday : today,
    cutoffLabel: SUBMISSION_CUTOFF_LABEL,
  };
}

/** Strict format + eligibility check — the single gate both POST routes use.
 * Never infers or rewrites a date; only ever answers yes/no for the exact
 * string given, so a manipulated client can't smuggle in an ineligible date.
 * Sunday is rejected as a target date outright (first check below) — that
 * alone is what makes Sunday itself unsubmittable; it is deliberately NOT
 * gated on what today is, so a Saturday date stays submittable on Sunday
 * morning exactly as getSubmissionWindow() above computes. */
export function isEligibleSubmissionDate(dateStr, now = new Date()) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return false;
  if (ptDayOfWeek(dateStr) === 0) return false; // Sunday never accepts a submission, on either side of any window
  const w = getSubmissionWindow(now);
  if (dateStr === w.today) return true;
  return dateStr === w.yesterday && w.yesterdayEligible;
}

/** Human-readable reason a date is (or would be) closed — for error
 * responses and UI messaging. Returns null for an eligible date. */
export function eligibilityMessageFor(dateStr, now = new Date()) {
  if (isEligibleSubmissionDate(dateStr, now)) return null;
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return 'Invalid date.';
  if (ptDayOfWeek(dateStr) === 0) return 'Sunday is a rest day — no submission is required or accepted.';
  const w = getSubmissionWindow(now);
  if (dateStr === w.yesterday && !w.yesterdayEligible) {
    return `Yesterday's window closed at ${w.cutoffLabel}.`;
  }
  return 'That date is not open for submission.';
}

export { DATE_RE as SUBMISSION_DATE_PATTERN };
