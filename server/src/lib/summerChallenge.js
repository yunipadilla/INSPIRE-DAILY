const SCREEN_TIME_POINTS = { 1: 3, 2: 2, 3: 1, 4: 0 };

// --- Reading ----------------------------------------------------------------
// Reading is the ONE category whose daily cap changed after launch, so its
// limits live here, in one place, keyed by the entry's own DATE:
//   - entries dated BEFORE READING_CAP_EFFECTIVE_DATE keep the original cap
//     (4 points: up to 4 thirty-minute sessions at 1 point each), because
//     real participants earned and were shown those totals;
//   - entries dated ON OR AFTER it are capped at READING_MAX_POINTS.
// Keying on the entry date (not "now") keeps every recompute — the 15-minute
// drift-correcting agent, HQ's per-day audit, any future rebuild — giving the
// same answer for the same row forever, so history can never be re-scored.
export const READING_POINTS_PER_SESSION = 1; // 1 point per 30-minute session
export const READING_MAX_POINTS = 1.5;
export const LEGACY_READING_MAX_POINTS = 4;
export const READING_CAP_EFFECTIVE_DATE = '2026-11-24';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Entry dates are plain 'YYYY-MM-DD' strings (the database date type is parsed
 * as text — see db.js). Refusing anything else means a caller that forgets the
 * date fails loudly instead of silently re-scoring history under the wrong rule. */
function assertEntryDate(date) {
  if (typeof date !== 'string' || !ISO_DATE_RE.test(date)) {
    throw new TypeError(`Challenge scoring needs the entry date as 'YYYY-MM-DD' (got ${JSON.stringify(date)}).`);
  }
}

/** Maximum Reading points that count for an entry dated `date`. */
export function readingMaxPointsFor(date) {
  assertEntryDate(date);
  return date >= READING_CAP_EFFECTIVE_DATE ? READING_MAX_POINTS : LEGACY_READING_MAX_POINTS;
}

/** Most 30-minute sessions that can still add points on `date` (more sessions
 * add nothing, so new submissions never store more than this). */
export function readingMaxSessionsFor(date) {
  return Math.ceil(readingMaxPointsFor(date) / READING_POINTS_PER_SESSION);
}

/** Reading points: sessions × 1 point, capped for the entry's date. Negative or
 * non-numeric input counts as 0. */
export function readingPoints(sessions, date) {
  const n = Math.max(0, Number(sessions) || 0);
  return Math.min(readingMaxPointsFor(date), n * READING_POINTS_PER_SESSION);
}
const COLD_PLUNGE_POINTS = { plunge: 1, shower: 0.5, none: 0 };

/** 1 point per COMPLETE 30 minutes of Project/Volunteer Work — never a
 * fraction of a point for a partial half-hour. */
export function projectWorkPoints(minutes) {
  return Math.floor((Number(minutes) || 0) / 30);
}

// A submission can't claim more project time than exists in a day — a
// generous but real ceiling (16h), not a rubber-stamped arbitrary number.
export const MAX_PROJECT_MINUTES = 960;

/**
 * Turns an untrusted request body into the exact values that get stored and
 * scored for the entry dated `date`. Everything is clamped to what the rules
 * allow (Reading sessions past the day's cap can't add points, so they are
 * never stored), and the caller scores these cleaned values — never anything
 * the client says about points.
 */
export function buildSummerEntryValues(body, date) {
  const b = body || {};
  return {
    sleepBedBefore10: Boolean(b.sleepBedBefore10),
    sleep8h: Boolean(b.sleep8h),
    hydration: Boolean(b.hydration),
    exercise: Boolean(b.exercise),
    screenTimeTier: [1, 2, 3, 4].includes(Number(b.screenTimeTier)) ? Number(b.screenTimeTier) : null,
    mindfulnessSessions: Math.max(0, Math.min(3, Number(b.mindfulnessSessions) || 0)),
    readingSessions: Math.max(0, Math.min(readingMaxSessionsFor(date), Math.round(Number(b.readingSessions)) || 0)),
    dailyUpdateSent: Boolean(b.dailyUpdateSent),
    nutrition: Boolean(b.nutrition),
    coldPlungeType: ['plunge', 'shower', 'none'].includes(b.coldPlungeType) ? b.coldPlungeType : null,
    // Project/Volunteer Work: 1 pt per complete 30 min, computed server-side
    // only (calculateSummerPoints) — a client-submitted minute count is
    // just a duration claim, never a point value to trust directly.
    projectMinutes: Math.max(0, Math.min(MAX_PROJECT_MINUTES, Math.round(Number(b.projectMinutes)) || 0)),
  };
}

/**
 * Registry of every Inspire Challenge category, in submission-form order —
 * the ONE place category ids/labels/units are defined, so HQ's per-category
 * audit breakdown (services/hq/challengeService.js) and any future consumer
 * read the same names the participant-facing form and this file itself use,
 * instead of scattering category-name strings across the codebase. `max` is
 * the fixed per-day cap for that category, or null when uncapped (Project
 * Work). Never encodes "higher is better" judgment beyond the point values
 * already live in submission scoring.
 */
export const SUMMER_CHALLENGE_CATEGORIES = [
  { id: 'sleepBedBefore10', label: 'Bed by 10pm', unit: 'boolean', max: 1 },
  { id: 'sleep8h', label: '8+ Hrs Sleep', unit: 'boolean', max: 1 },
  { id: 'hydration', label: 'Hydration', unit: 'boolean', max: 1 },
  { id: 'exercise', label: 'Exercise', unit: 'boolean', max: 2 },
  { id: 'screenTimeTier', label: 'Screen Time', unit: 'tier', max: 3 },
  { id: 'mindfulnessSessions', label: 'Mindfulness', unit: 'count', max: 3 },
  // Current cap; entries dated before READING_CAP_EFFECTIVE_DATE used legacyMax.
  { id: 'readingSessions', label: 'Reading', unit: 'count', max: READING_MAX_POINTS, legacyMax: LEGACY_READING_MAX_POINTS },
  { id: 'dailyUpdateSent', label: 'Daily Scores', unit: 'boolean', max: 4 },
  { id: 'nutrition', label: 'Nutrition', unit: 'boolean', max: 1 },
  { id: 'coldPlungeType', label: 'Cold Plunge/Shower', unit: 'choice', max: 1 },
  { id: 'projectMinutes', label: 'Project / Volunteer Work', unit: 'minutes', max: null },
];

/**
 * The authoritative category-input -> category-points mapping. Every other
 * point calculation in this file (the plain total, and the HQ audit
 * breakdown) is derived from THIS function's output, never a second copy of
 * the arithmetic — one source of truth for category input -> category
 * points -> daily total.
 */
function categoryPointsOf(entry, date) {
  return {
    sleepBedBefore10: entry.sleepBedBefore10 ? 1 : 0,
    sleep8h: entry.sleep8h ? 1 : 0,
    hydration: entry.hydration ? 1 : 0,
    exercise: entry.exercise ? 2 : 0,
    screenTimeTier: entry.screenTimeTier ? (SCREEN_TIME_POINTS[entry.screenTimeTier] || 0) : 0,
    mindfulnessSessions: Math.min(3, Number(entry.mindfulnessSessions) || 0),
    readingSessions: readingPoints(entry.readingSessions, date),
    dailyUpdateSent: entry.dailyUpdateSent ? 4 : 0,
    nutrition: entry.nutrition ? 1 : 0,
    coldPlungeType: entry.coldPlungeType ? (COLD_PLUNGE_POINTS[entry.coldPlungeType] || 0) : 0,
    projectMinutes: projectWorkPoints(entry.projectMinutes),
  };
}

/** Full breakdown — per-category points (keyed by SUMMER_CHALLENGE_CATEGORIES
 * ids) plus the total. This is what HQ's per-member audit table consumes so
 * it never has a second, possibly-drifting copy of the point rules. */
export function calculateSummerPointsBreakdown(entry, date) {
  const categories = categoryPointsOf(entry, date);
  const total = Object.values(categories).reduce((sum, p) => sum + p, 0);
  return { categories, total };
}

/** Computes the authoritative point total server-side — never trust a
 * client-submitted total. `date` is the entry's own date (see Reading above). Thin wrapper over calculateSummerPointsBreakdown
 * so submission scoring and the HQ breakdown can never disagree. */
export function calculateSummerPoints(entry, date) {
  return calculateSummerPointsBreakdown(entry, date).total;
}

// Every fixed-cap category's max, NOT counting Project/Volunteer Work — that
// category is intentionally uncapped (floor(minutes/30)), so there is no
// longer a true program-wide ceiling; this constant now documents only the
// fixed-category total for anywhere that still wants it.
export const SUMMER_CHALLENGE_MAX_POINTS = 18.5; // entries dated on/after READING_CAP_EFFECTIVE_DATE
export const LEGACY_SUMMER_CHALLENGE_MAX_POINTS = 21; // earlier entries (Reading capped at 4)
