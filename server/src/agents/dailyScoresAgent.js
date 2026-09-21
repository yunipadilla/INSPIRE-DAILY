// Silent background agent — Daily Scores section only.
// Runs once daily at noon Pacific Time (the instant every submission deadline
// actually closes; see the comment in lib/streakEngine.js for why noon, not
// midnight, is correct here) and reconciles every approved user's stored
// streak_count/streak_shields against the true value computed from their
// daily_scores history. Never touches any other section's tables, never
// surfaces anything to the user — failures are logged and skipped per-user
// so one bad row can't halt the run.
//
// This app runs on Render's free tier, which suspends the whole process
// after a period of no inbound traffic — an in-process cron scheduled here
// simply does not exist to fire while the dyno is asleep, and node-cron has
// no catch-up mechanism for a missed tick (confirmed as the actual root
// cause of a 2026-09-16 production incident: several users, including one
// protected by a shield, sat with correct-but-uncommitted reconciliation
// for hours because the noon tick never ran). `reconcileOneUser` is
// exported specifically so middleware/auth.js can opportunistically run the
// exact same logic, at most once per day per user, as a side effect of that
// user's own next authenticated request — real traffic the free tier does
// serve — making this self-healing regardless of whether the cron itself
// ever fires.
import { query, withTransaction } from '../db.js';
import { reconcileUserStreak } from '../lib/streakEngine.js';
import { updateStreakFields } from '../repositories/users.js';
import { listDatesForUser } from '../repositories/dailyScores.js';
import { getAllCheckpoints } from '../repositories/base44Checkpoints.js';
import { insertShieldEvent, listBridgedDatesForUser } from '../repositories/streakShieldEvents.js';
import { ptDateString, PACIFIC_TIME_ZONE } from '../config/pacificTime.js';
import { scheduleSafeCron } from '../lib/safeCron.js';

/**
 * Reconciles ONE user against their real Daily Score history and applies
 * whatever action is due. The shield-consumption write is a single atomic
 * transaction — the preserved streak fields, the decremented shield count,
 * the reset earning anchor, and the audit ledger row all commit together or
 * not at all, so it can never be true that the streak was saved but the
 * shield wasn't deducted (or the reverse). Every branch — including the
 * no-op 'none' case — stamps `last_streak_reconcile_date`, which is what
 * lets a caller (this file's own loop, or the opportunistic per-request
 * check in middleware/auth.js) skip a user who's already been checked today
 * without re-running the two lookup queries.
 */
export async function reconcileOneUser(user, now, checkpoint) {
  const [submittedDates, previouslyBridgedDates] = await Promise.all([
    listDatesForUser(user.id),
    listBridgedDatesForUser(user.id),
  ]);
  const outcome = reconcileUserStreak({ user, submittedDates, now, checkpoint, previouslyBridgedDates });
  const today = ptDateString(now);
  const bridgedDates = outcome.bridgedDates || [];

  if (bridgedDates.length > 0) {
    // One or more shields were consumed as part of this reconciliation --
    // action is either 'shield_consumed' or a Sunday/Monday/before-noon
    // 'sync' that also found a shield-protectable gap (see
    // streakEngine.js's syncOutcome). Streak fields, the decremented shield
    // count/reset earning anchor, and one audit ledger row per shield all
    // commit in a single transaction — never a state where the streak is
    // preserved but a shield isn't deducted, or the reverse.
    await withTransaction(async (client) => {
      await client.query(
        `update users
            set streak_count = $2, streak_shields = $3, streak_last_date = $4,
                shield_progress_anchor = $5, last_streak_reconcile_date = $6
          where id = $1`,
        [user.id, outcome.streakCount, outcome.streakShields, outcome.streakLastDate, outcome.shieldProgressAnchor, today]
      );
      for (const bridgedDate of bridgedDates) {
        await insertShieldEvent({
          userId: user.id,
          eventType: 'consumed',
          amount: -1,
          streakValue: outcome.streakCount,
          eventDate: bridgedDate,
          reason: 'Missed required Daily Score day — streak protected by shield.',
          client,
        });
      }
    });
  } else if (outcome.action === 'sync') {
    await updateStreakFields(user.id, { streak_count: outcome.streakCount, last_streak_reconcile_date: today });
  } else if (outcome.action === 'reset') {
    await updateStreakFields(user.id, {
      streak_count: outcome.streakCount,
      streak_last_date: outcome.streakLastDate,
      streak_recovery_available_until: outcome.recoveryAvailableUntil,
      streak_recovery_prior_count: outcome.recoveryPriorCount,
      shield_progress_anchor: outcome.shieldProgressAnchor,
      last_streak_reconcile_date: today,
    });
  } else {
    await updateStreakFields(user.id, { last_streak_reconcile_date: today });
  }

  return outcome;
}

export async function runDailyScoresAgent(now = new Date()) {
  const { rows: users } = await query(
    "select id, streak_count, streak_shields from users where account_status = 'approved'"
  );
  const checkpointsByUser = await getAllCheckpoints();

  let synced = 0;
  let shielded = 0;
  let reset = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const checkpointRow = checkpointsByUser.get(user.id);
      const checkpoint = checkpointRow
        ? { checkpointDate: checkpointRow.checkpoint_date, streakCheckpoint: checkpointRow.streak_checkpoint }
        : null;
      const outcome = await reconcileOneUser(user, now, checkpoint);

      if (outcome.action === 'sync') synced += 1;
      else if (outcome.action === 'shield_consumed') shielded += 1;
      else if (outcome.action === 'reset') reset += 1;
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
