const SCREEN_TIME_POINTS = { 1: 3, 2: 2, 3: 1, 4: 0 };
const COLD_PLUNGE_POINTS = { plunge: 1, shower: 0.5, none: 0 };

/** 1 point per COMPLETE 30 minutes of Project/Volunteer Work — never a
 * fraction of a point for a partial half-hour. */
export function projectWorkPoints(minutes) {
  return Math.floor((Number(minutes) || 0) / 30);
}

/** Computes the authoritative point total server-side — never trust a client-submitted total. */
export function calculateSummerPoints(entry) {
  let points = 0;
  if (entry.sleepBedBefore10) points += 1;
  if (entry.sleep8h) points += 1;
  if (entry.hydration) points += 1;
  if (entry.exercise) points += 2;
  if (entry.screenTimeTier) points += SCREEN_TIME_POINTS[entry.screenTimeTier] || 0;
  points += Math.min(3, Number(entry.mindfulnessSessions) || 0);
  points += Math.min(4, Number(entry.readingSessions) || 0);
  if (entry.dailyUpdateSent) points += 4;
  if (entry.nutrition) points += 1;
  if (entry.coldPlungeType) points += COLD_PLUNGE_POINTS[entry.coldPlungeType] || 0;
  points += projectWorkPoints(entry.projectMinutes);
  return points;
}

// Every fixed-cap category's max, NOT counting Project/Volunteer Work — that
// category is intentionally uncapped (floor(minutes/30)), so there is no
// longer a true program-wide ceiling; this constant now documents only the
// fixed-category total for anywhere that still wants it.
export const SUMMER_CHALLENGE_MAX_POINTS = 21;
