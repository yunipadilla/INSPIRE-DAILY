// Silent background agent — Daily Scores section only.
// Runs once daily at noon Pacific Time (the instant every submission deadline
// actually closes; see the comment in lib/streakEngine.js for why noon, not
// midnight, is correct here) and reconciles every approved user's stored
// streak_count/streak_shields against the true value computed from their
// daily_scores history. Never touches any other section's tables, never
// surfaces anything to the user — failures are logged and skipped per-user
// so one bad row can't halt the run.
import { query } from '../db.js';
import { reconcileUserStreak } from '../lib/streakEngine.js';
import { updateStreakFields } from '../repositories/users.js';
import { listDatesForUser } from '../repositories/dailyScores.js';
import { PACIFIC_TIME_ZONE } from '../config/pacificTime.js';
import { scheduleSafeCron } from '../lib/safeCron.js';

export async function runDailyScoresAgent(now = new Date()) {
  const { rows: users } = await query(
    "select id, streak_count, streak_shields from users where account_status = 'approved'"
  );

  let synced = 0;
  let shielded = 0;
  let reset = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const submittedDates = await listDatesForUser(user.id);
      const outcome = reconcileUserStreak({ user, submittedDates, now });

      if (outcome.action === 'sync') {
        await updateStreakFields(user.id, { streak_count: outcome.streakCount });
        synced += 1;
      } else if (outcome.action === 'shield_consumed') {
        await updateStreakFields(user.id, {
          streak_shields: outcome.streakShields,
          streak_last_date: outcome.streakLastDate,
        });
        shielded += 1;
      } else if (outcome.action === 'reset') {
        await updateStreakFields(user.id, {
          streak_count: 0,
          streak_last_date: null,
          streak_recovery_available_until: outcome.recoveryAvailableUntil,
          streak_recovery_prior_count: outcome.recoveryPriorCount,
        });
        reset += 1;
      }
    } catch (err) {
      errors += 1;
      console.error(`[dailyScoresAgent] failed to reconcile user ${user.id}:`, err.message);
    }
  }

  console.log(
    `[dailyScoresAgent] processed=${users.length} synced=${synced} shielded=${shielded} reset=${reset} errors=${errors}`
  );
}

export function scheduleDailyScoresAgent() {
  scheduleSafeCron('0 12 * * *', 'dailyScoresAgent', runDailyScoresAgent, { timezone: PACIFIC_TIME_ZONE });
}
