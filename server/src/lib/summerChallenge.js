const SCREEN_TIME_POINTS = { 1: 3, 2: 2, 3: 1, 4: 0 };
const COLD_PLUNGE_POINTS = { plunge: 1, shower: 0.5, none: 0 };

/** 1 point per COMPLETE 30 minutes of Project/Volunteer Work — never a
 * fraction of a point for a partial half-hour. */
export function projectWorkPoints(minutes) {
  return Math.floor((Number(minutes) || 0) / 30);
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
  { id: 'readingSessions', label: 'Reading', unit: 'count', max: 4 },
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
function categoryPointsOf(entry) {
  return {
    sleepBedBefore10: entry.sleepBedBefore10 ? 1 : 0,
    sleep8h: entry.sleep8h ? 1 : 0,
    hydration: entry.hydration ? 1 : 0,
    exercise: entry.exercise ? 2 : 0,
    screenTimeTier: entry.screenTimeTier ? (SCREEN_TIME_POINTS[entry.screenTimeTier] || 0) : 0,
    mindfulnessSessions: Math.min(3, Number(entry.mindfulnessSessions) || 0),
    readingSessions: Math.min(4, Number(entry.readingSessions) || 0),
    dailyUpdateSent: entry.dailyUpdateSent ? 4 : 0,
    nutrition: entry.nutrition ? 1 : 0,
    coldPlungeType: entry.coldPlungeType ? (COLD_PLUNGE_POINTS[entry.coldPlungeType] || 0) : 0,
    projectMinutes: projectWorkPoints(entry.projectMinutes),
  };
}

/** Full breakdown — per-category points (keyed by SUMMER_CHALLENGE_CATEGORIES
 * ids) plus the total. This is what HQ's per-member audit table consumes so
 * it never has a second, possibly-drifting copy of the point rules. */
export function calculateSummerPointsBreakdown(entry) {
  const categories = categoryPointsOf(entry);
  const total = Object.values(categories).reduce((sum, p) => sum + p, 0);
  return { categories, total };
}

/** Computes the authoritative point total server-side — never trust a
 * client-submitted total. Thin wrapper over calculateSummerPointsBreakdown
 * so submission scoring and the HQ breakdown can never disagree. */
export function calculateSummerPoints(entry) {
  return calculateSummerPointsBreakdown(entry).total;
}

// Every fixed-cap category's max, NOT counting Project/Volunteer Work — that
// category is intentionally uncapped (floor(minutes/30)), so there is no
// longer a true program-wide ceiling; this constant now documents only the
// fixed-category total for anywhere that still wants it.
export const SUMMER_CHALLENGE_MAX_POINTS = 21;
