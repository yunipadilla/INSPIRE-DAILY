// Silent background agent — Daily Scores streaks/shields.
// Runs at noon Pacific Time (the instant each day's submission deadline
// closes) and reconciles every approved user through the one canonical
// service (services/streakService.js). It never implements streak math
// itself.
//
// This app runs on Render's free tier, which suspends the process when
// idle, so this tick cannot be trusted to fire every day; middleware/auth.js
// also reconciles on real traffic (once per noon window). Both paths call
// the same idempotent reconcileUser, so running either, both, or either one
// repeatedly produces identical state.
import { reconcileAllUsers } from '../services/streakService.js';
import { PACIFIC_TIME_ZONE } from '../config/pacificTime.js';
import { scheduleSafeCron } from '../lib/safeCron.js';

export async function runDailyScoresAgent(now = new Date()) {
  const s = await reconcileAllUsers({ now, source: 'cron' });
  console.log(
    `[dailyScoresAgent] processed=${s.processed} changed=${s.changed.length} anomalies=${s.anomalies.length} errors=${s.errors.length}`
  );
  return s;
}

export function scheduleDailyScoresAgent() {
  scheduleSafeCron('0 12 * * *', 'dailyScoresAgent', runDailyScoresAgent, { timezone: PACIFIC_TIME_ZONE });
}
