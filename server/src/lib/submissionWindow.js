// Canonical submission-window rule, shared by Daily Scores and Inspire
// Challenge — the ONLY place this rule is implemented. Both routes call
// these functions; neither reimplements its own cutoff math.
//
// Rule: a record for calendar date D may be submitted during D itself, or
// on D+1 up to and including 11:59:59 AM Pacific — the window closes at
// exactly 12:00:00 PM Pacific on D+1. Sunday is always a rest day (never
// open for submission, on either side of the window) — this is layered on
// top of the same noon-cutoff math, not a separate parallel rule.
import { ptDateString, ptDayOfWeek, isBeforeNoonPT, addDays } from '../config/pacificTime.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const SUBMISSION_CUTOFF_LABEL = '12:00 PM Pacific Time';

/**
 * The full eligibility snapshot for "right now" — everything both the API
 * and the UI need to know which date(s) may be submitted and which should
 * be pre-selected. `todayIsSunday` short-circuits the whole day to a rest
 * state (matches the app's long-standing behavior: on a Sunday, no Daily
 * Scores/Challenge flow is offered at all, including a Saturday catch-up —
 * preserved deliberately, not a new rule).
 */
export function getSubmissionWindow(now = new Date()) {
  const today = ptDateString(now);
  const yesterday = addDays(today, -1);
  const beforeNoon = isBeforeNoonPT(now);
  const todayIsSunday = ptDayOfWeek(today) === 0;
  const yesterdayIsSunday = ptDayOfWeek(yesterday) === 0;
  const yesterdayEligible = !todayIsSunday && beforeNoon && !yesterdayIsSunday;

  return {
    today,
    yesterday,
    beforeNoon,
    todayIsSunday,
    yesterdayIsSunday,
    yesterdayEligible,
    // Daily Scores/Challenge are primarily a reflection on the day just
    // finished — while yesterday is still open, it's the preferred choice;
    // once its window closes, today becomes the only sensible default.
    defaultDate: yesterdayEligible ? yesterday : today,
    cutoffLabel: SUBMISSION_CUTOFF_LABEL,
  };
}

/** Strict format + eligibility check — the single gate both POST routes use.
 * Never infers or rewrites a date; only ever answers yes/no for the exact
 * string given, so a manipulated client can't smuggle in an ineligible date. */
export function isEligibleSubmissionDate(dateStr, now = new Date()) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return false;
  if (ptDayOfWeek(dateStr) === 0) return false; // Sunday is never open, on either side of the window
  const w = getSubmissionWindow(now);
  if (w.todayIsSunday) return false; // whole day is a rest day — no catch-up offered either
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
