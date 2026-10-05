/**
 * Canonical streak/shield service — the ONLY code that writes
 * users.streak_count / streak_shields / streak_last_date or the
 * streak_shield_events ledger (2026-10-04 stability rebuild).
 *
 * Every caller — Daily Score submission, the noon-PT cron, the per-request
 * catch-up in middleware/auth.js, HQ reads, and repair scripts — goes
 * through `reconcileUser`, which:
 *
 *   1. takes a per-user transaction-scoped advisory lock (two overlapping
 *      runs for the same user serialize instead of racing);
 *   2. recomputes state with the pure chronological replay in
 *      lib/streakEngine.js from real data only (daily_scores + the
 *      checkpoint baseline, applied once);
 *   3. checks invariants and refuses to write — logging loudly instead —
 *      if the result would raise a streak or shield count by more than the
 *      number of genuinely new Daily Score rows since the last reconcile
 *      (i.e. "no value moves up without a real event");
 *   4. writes the user's fields (only if changed) and syncs the shield
 *      ledger in the SAME transaction: derived earn/consume events are
 *      inserted (a partial unique index makes a second insert for the same
 *      user/type/date impossible), and any active ledger row the replay no
 *      longer derives is VOIDED (kept, timestamped, with a reason) — never
 *      deleted.
 *
 * Because the replay is a pure function of stored data, reconciling the
 * same unchanged data any number of times yields the same state and writes
 * nothing new.
 */
import { query, withTransaction } from '../db.js';
import { replayStreak, baselineFromCheckpoint, clockFrom, STREAK_CONSTANTS } from '../lib/streakEngine.js';
import { ptDateString, isBeforeNoonPT } from '../config/pacificTime.js';

const LEDGER_TYPES = new Set(['earned', 'consumed']);
const eventKey = (type, date) => `${type}|${date}`;

/** Which reconciliation "window" an instant falls in. Deadlines only ever
 * close at noon PT, so state can only change across these boundaries (or
 * when new data arrives, which reconciles explicitly). */
export function reconcileWindowKey(instant) {
  const t = instant instanceof Date ? instant : new Date(instant);
  return `${ptDateString(t)}|${isBeforeNoonPT(t) ? 'am' : 'pm'}`;
}

/** True when a user's stored state may be behind the clock. */
export function needsReconcile(user, now = new Date()) {
  if (!user?.last_streak_reconciled_at) return true;
  return reconcileWindowKey(user.last_streak_reconciled_at) !== reconcileWindowKey(now);
}

/**
 * Reconcile one user. Returns { userId, before, after, changed,
 * insertedEvents, voidedEvents, anomaly } — or null if the user is gone.
 *
 * @param {object} [opts]
 * @param {Date} [opts.now]
 * @param {boolean} [opts.allowRebaseline] - skip the "no upward jump without
 *   new rows" guard. Only for audited repairs; it is also implied
 *   automatically when the user's checkpoint changed since their last
 *   reconcile (an admin re-baseline is itself the auditable event).
 * @param {string} [opts.source] - recorded on new ledger rows.
 * @param {boolean} [opts.dryRun] - compute and report, write nothing.
 */
export async function reconcileUser(userId, { now = new Date(), allowRebaseline = false, source = 'reconcile', dryRun = false } = {}) {
  return withTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`streak:${userId}`]);

    const { rows: userRows } = await client.query(
      `select id, streak_count, streak_shields, streak_last_date::text as streak_last_date, last_streak_reconciled_at
         from users where id = $1 for update`,
      [userId]
    );
    const user = userRows[0];
    if (!user) return null;

    // Sequential on purpose: one transaction = one client connection.
    const { rows: scoreRows } = await client.query(
      'select date::text as date, submitted_at from daily_scores where user_id = $1',
      [userId]
    );
    const { rows: cpRows } = await client.query('select * from base44_checkpoints where user_id = $1', [userId]);
    const { rows: ledgerRows } = await client.query(
      `select id, event_type, event_date::text as event_date from streak_shield_events
        where user_id = $1 and voided_at is null and event_type in ('earned', 'consumed')`,
      [userId]
    );
    const checkpoint = cpRows[0] || null;
    const result = replayStreak({
      submittedDates: scoreRows.map((r) => r.date),
      baseline: baselineFromCheckpoint(checkpoint),
      ...clockFrom(now),
    });

    const before = { streak: user.streak_count, shields: user.streak_shields, lastDate: user.streak_last_date };
    const after = { streak: result.streak, shields: result.shields, lastDate: result.lastContinuityDate };
    const report = { userId, before, after, progress: result.progress, changed: false, insertedEvents: [], voidedEvents: [], anomaly: null };

    // ── Invariants ───────────────────────────────────────────────────────
    if (after.shields < 0 || after.shields > STREAK_CONSTANTS.MAX_SHIELDS || after.streak < 0) {
      report.anomaly = `impossible state from replay: streak=${after.streak} shields=${after.shields}`;
    }
    const lastAt = user.last_streak_reconciled_at ? new Date(user.last_streak_reconciled_at).getTime() : null;
    const checkpointChanged = checkpoint && lastAt !== null && new Date(checkpoint.migrated_at).getTime() > lastAt;
    if (!report.anomaly && !allowRebaseline && !checkpointChanged && lastAt !== null) {
      const newRows = scoreRows.filter((r) => new Date(r.submitted_at).getTime() > lastAt).length;
      if (after.streak > before.streak + newRows || after.shields > before.shields + newRows) {
        report.anomaly =
          `upward jump without matching new Daily Score rows (new rows since last reconcile: ${newRows}; ` +
          `streak ${before.streak}->${after.streak}, shields ${before.shields}->${after.shields})`;
      }
    }
    if (report.anomaly) {
      console.error(`[streakService] INVARIANT FAILED for user ${userId} — not writing: ${report.anomaly}`);
      return report;
    }

    // ── Ledger diff ─────────────────────────────────────────────────────
    const derived = result.events.filter((e) => LEDGER_TYPES.has(e.type));
    const derivedKeys = new Set(derived.map((e) => eventKey(e.type, e.date)));
    const activeKeys = new Set(ledgerRows.map((e) => eventKey(e.event_type, e.event_date)));
    const toInsert = derived.filter((e) => !activeKeys.has(eventKey(e.type, e.date)));
    const toVoid = ledgerRows.filter((e) => !derivedKeys.has(eventKey(e.event_type, e.event_date)));

    report.changed =
      before.streak !== after.streak || before.shields !== after.shields || before.lastDate !== after.lastDate ||
      toInsert.length > 0 || toVoid.length > 0;
    report.insertedEvents = toInsert.map((e) => ({ type: e.type, date: e.date, streakValue: e.streakValue }));
    report.voidedEvents = toVoid.map((e) => ({ id: e.id, type: e.event_type, date: e.event_date }));
    if (dryRun) return report;

    if (before.streak !== after.streak || before.shields !== after.shields || before.lastDate !== after.lastDate) {
      await client.query(
        'update users set streak_count = $2, streak_shields = $3, streak_last_date = $4 where id = $1',
        [userId, after.streak, after.shields, after.lastDate]
      );
    }
    for (const e of toVoid) {
      await client.query(
        `update streak_shield_events set voided_at = now(), void_reason = $2 where id = $1`,
        [e.id, `not derived by canonical replay (${source})`]
      );
    }
    for (const e of toInsert) {
      await client.query(
        `insert into streak_shield_events (user_id, event_type, amount, streak_value, event_date, reason, source)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id, event_type, event_date) where voided_at is null do nothing`,
        [
          userId,
          e.type,
          e.type === 'earned' ? 1 : -1,
          e.streakValue,
          e.date,
          e.type === 'earned'
            ? '7 consecutive required Daily Score days completed.'
            : 'Missed required Daily Score day — streak protected by shield.',
          source,
        ]
      );
    }
    await client.query('update users set last_streak_reconciled_at = now() where id = $1', [userId]);
    return report;
  });
}

/**
 * Reconcile every approved account. Per-user failures are isolated; a few
 * users run in parallel (per-user advisory locks keep that safe).
 * `onlyStale` skips users already reconciled in the current window.
 */
export async function reconcileAllUsers({ onlyStale = false, concurrency = 4, ...opts } = {}) {
  const now = opts.now || new Date();
  const { rows } = await query(
    "select id, last_streak_reconciled_at from users where account_status = 'approved' order by id"
  );
  const targets = onlyStale ? rows.filter((u) => needsReconcile(u, now)) : rows;
  const summary = { processed: 0, skipped: rows.length - targets.length, changed: [], anomalies: [], errors: [] };
  let next = 0;
  async function worker() {
    while (next < targets.length) {
      const { id } = targets[next++];
      try {
        const r = await reconcileUser(id, { ...opts, now });
        summary.processed += 1;
        if (r?.anomaly) summary.anomalies.push(r);
        else if (r?.changed) summary.changed.push(r);
      } catch (err) {
        summary.errors.push({ userId: id, error: err.message });
        console.error(`[streakService] reconcile failed for ${id}:`, err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return summary;
}

// Single-flight, once-per-window program-wide reconcile. Render's free tier
// suspends this process when idle, so the noon cron can't be relied on —
// the first authenticated request in each window triggers this instead.
// Re-running it is harmless (idempotent); this only avoids redundant work.
let programWindowDone = null;
let programInFlight = null;
export function ensureProgramReconciled(now = new Date()) {
  const key = reconcileWindowKey(now);
  if (programWindowDone === key) return Promise.resolve();
  if (programInFlight) return programInFlight;
  programInFlight = reconcileAllUsers({ now, source: 'request', onlyStale: true })
    .then((s) => {
      programWindowDone = key;
      if (s.changed.length || s.anomalies.length || s.errors.length) {
        console.log(`[streakService] window ${key}: changed=${s.changed.length} anomalies=${s.anomalies.length} errors=${s.errors.length}`);
      }
    })
    .catch((err) => console.error('[streakService] program reconcile failed:', err.message))
    .finally(() => { programInFlight = null; });
  return programInFlight;
}

/** Read-only resolved state for display (HQ panel's "progress to next
 * shield"). Never writes. */
export async function resolveStreakState(userId, now = new Date()) {
  const [{ rows: scoreRows }, { rows: cpRows }] = await Promise.all([
    query('select date::text as date from daily_scores where user_id = $1', [userId]),
    query('select * from base44_checkpoints where user_id = $1', [userId]),
  ]);
  return replayStreak({
    submittedDates: scoreRows.map((r) => r.date),
    baseline: baselineFromCheckpoint(cpRows[0] || null),
    ...clockFrom(now),
  });
}
