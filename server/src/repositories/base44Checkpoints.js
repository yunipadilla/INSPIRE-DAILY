/**
 * Base44 transition checkpoints — narrow additive table (Inspire 2.3).
 *
 * Represents a manually-approved, explicitly unverifiable-from-raw-records
 * baseline: "as of checkpoint_date, this user's Base44 streak/Challenge
 * state was X" — supplied by program staff, not derived from any imported
 * submission row (none exist for the affected dates; see
 * MIGRATION_READINESS_REPORT.md / session history). This table is the ONLY
 * place that assumption lives — every canonical calculation elsewhere
 * (streakEngine.js, Challenge point queries) either consults it explicitly
 * (for the small set of checkpointed users) or ignores it entirely
 * (everyone else, unaffected, unchanged behavior).
 *
 * One row per user (user_id UNIQUE) — a checkpoint is a baseline you stand
 * on, not a growing ledger; a future re-checkpoint is an UPDATE, not a new
 * row, and remains a single auditable fact per person.
 */
import { query } from '../db.js';

export async function getCheckpointForUser(userId) {
  const { rows } = await query('select * from base44_checkpoints where user_id = $1', [userId]);
  return rows[0] || null;
}

/** Map<user_id, checkpoint row> for every checkpointed user — one query,
 * used by the noon cron and any multi-user aggregate that needs to batch. */
export async function getAllCheckpoints() {
  const { rows } = await query('select * from base44_checkpoints');
  return new Map(rows.map((r) => [r.user_id, r]));
}

export async function upsertCheckpoint({
  userId, checkpointDate, streakCheckpoint, challengePeriod,
  challengePointsCheckpoint, challengeDaysCheckpoint, createdBy,
}) {
  const { rows } = await query(
    `insert into base44_checkpoints
       (user_id, checkpoint_date, streak_checkpoint, challenge_period, challenge_points_checkpoint, challenge_days_checkpoint, created_by)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (user_id) do update set
       checkpoint_date = excluded.checkpoint_date,
       streak_checkpoint = excluded.streak_checkpoint,
       challenge_period = excluded.challenge_period,
       challenge_points_checkpoint = excluded.challenge_points_checkpoint,
       challenge_days_checkpoint = excluded.challenge_days_checkpoint,
       created_by = excluded.created_by,
       migrated_at = now()
     returning *`,
    [userId, checkpointDate, streakCheckpoint, challengePeriod, challengePointsCheckpoint, challengeDaysCheckpoint, createdBy]
  );
  return rows[0];
}

export async function deleteCheckpoint(userId) {
  const { rows } = await query('delete from base44_checkpoints where user_id = $1 returning id', [userId]);
  return rows[0] || null;
}
