const SCREEN_TIME_POINTS = { 1: 3, 2: 2, 3: 1, 4: 0 };
const COLD_PLUNGE_POINTS = { plunge: 1, shower: 0.5, none: 0 };

// Mirrors server/src/lib/summerChallenge.js exactly — used for live preview
// only; the server always recomputes the authoritative total on submit.

// Reading: 1 point per 30-minute session, capped per day. Keep in step with the
// server's READING_* constants; entries dated before the effective date keep the
// original 4-point cap (the form only ever scores the day being submitted, but
// the date still decides which cap applies).
export const READING_POINTS_PER_SESSION = 1;
export const READING_MAX_POINTS = 1.5;
export const LEGACY_READING_MAX_POINTS = 4;
export const READING_CAP_EFFECTIVE_DATE = '2026-11-24';

/** True when `date` (the day being submitted) is scored under the ORIGINAL
 * Reading rule (up to 4 points) rather than the 1.5-point cap. */
export function isLegacyReadingDate(date) {
  return Boolean(date) && date < READING_CAP_EFFECTIVE_DATE;
}

export function readingMaxPointsFor(date) {
  // No date yet (page still loading) → show the current cap.
  return !date || date >= READING_CAP_EFFECTIVE_DATE ? READING_MAX_POINTS : LEGACY_READING_MAX_POINTS;
}

/** Most 30-minute sessions that can still add points on `date`. */
export function readingMaxSessionsFor(date) {
  return Math.ceil(readingMaxPointsFor(date) / READING_POINTS_PER_SESSION);
}

export function readingPoints(sessions, date) {
  const n = Math.max(0, Number(sessions) || 0);
  return Math.min(readingMaxPointsFor(date), n * READING_POINTS_PER_SESSION);
}
export function projectWorkPoints(minutes) {
  return Math.floor((Number(minutes) || 0) / 30);
}

export function calculateSummerPoints(entry, date) {
  let points = 0;
  if (entry.sleepBedBefore10) points += 1;
  if (entry.sleep8h) points += 1;
  if (entry.hydration) points += 1;
  if (entry.exercise) points += 2;
  if (entry.screenTimeTier) points += SCREEN_TIME_POINTS[entry.screenTimeTier] || 0;
  points += Math.min(3, Number(entry.mindfulnessSessions) || 0);
  points += readingPoints(entry.readingSessions, date);
  if (entry.dailyUpdateSent) points += 4;
  if (entry.nutrition) points += 1;
  if (entry.coldPlungeType) points += COLD_PLUNGE_POINTS[entry.coldPlungeType] || 0;
  points += projectWorkPoints(entry.projectMinutes);
  return points;
}
