const SCREEN_TIME_POINTS = { 1: 3, 2: 2, 3: 1, 4: 0 };
const COLD_PLUNGE_POINTS = { plunge: 1, shower: 0.5, none: 0 };

// Mirrors server/src/lib/summerChallenge.js exactly — used for live preview
// only; the server always recomputes the authoritative total on submit.
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
  return points;
}
