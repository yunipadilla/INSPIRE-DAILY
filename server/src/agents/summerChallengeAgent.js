// Silent background agent — Summer Challenge section only.
// Recomputes total_points for recent entries and corrects any drift from the
// canonical point formula (defense-in-depth even though points are always
// computed server-side at submission time). Never touches any other table.
import { query } from '../db.js';
import { calculateSummerPoints } from '../lib/summerChallenge.js';
import { addDays, ptDateString, PACIFIC_TIME_ZONE } from '../config/pacificTime.js';
import { scheduleSafeCron } from '../lib/safeCron.js';

export async function runSummerChallengeAgent() {
  const since = addDays(ptDateString(), -7);
  const { rows: entries } = await query('select * from summer_entries where date >= $1', [since]);

  let fixed = 0;
  for (const e of entries) {
    const expected = calculateSummerPoints({
      sleepBedBefore10: e.sleep_bed_before_10,
      sleep8h: e.sleep_8h,
      hydration: e.hydration,
      exercise: e.exercise,
      screenTimeTier: e.screen_time_tier,
      mindfulnessSessions: e.mindfulness_sessions,
      readingSessions: e.reading_sessions,
      dailyUpdateSent: e.daily_update_sent,
      nutrition: e.nutrition,
      coldPlungeType: e.cold_plunge_type,
    });
    if (Number(e.total_points) !== expected) {
      await query('update summer_entries set total_points = $2 where id = $1', [e.id, expected]);
      fixed += 1;
    }
  }

  if (fixed > 0) {
    console.log(`[summerChallengeAgent] checked=${entries.length} corrected=${fixed}`);
  }
}

export function scheduleSummerChallengeAgent() {
  scheduleSafeCron('*/15 * * * *', 'summerChallengeAgent', runSummerChallengeAgent, { timezone: PACIFIC_TIME_ZONE });
}
