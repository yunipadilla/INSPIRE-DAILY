/**
 * Canonical volunteer/project-time resolver — the ONE place that answers
 * "how many volunteer/project minutes did this happen in this period,"
 * whether that time was logged the old way (Daily Scores' `volunteer_hours`,
 * historical/legacy) or the new way (Inspire Challenge's `project_minutes`,
 * current). Nothing else should sum either column directly for a
 * user-facing total — call this instead, so legacy and current data are
 * never both counted for the same day and every caller (HQ Monthly
 * Snapshot, Inspire Challenge's "hours this month" display, Summary Agent)
 * agrees on the same number.
 *
 * The split is a hard date boundary, not a per-row migration: dates before
 * PROJECT_WORK_LAUNCH_DATE are read from daily_scores.volunteer_hours
 * (untouched, never rewritten — that historical data stays exactly as
 * imported/submitted); dates on/after it are read from
 * summer_entries.project_minutes. A period that spans the boundary (e.g. a
 * month picker landing on the launch month) correctly sums both halves.
 *
 * A small number of migrated users also carry a `base44_checkpoints` row
 * with `volunteer_minutes_checkpoint` set — a cumulative "as of
 * checkpoint_date" total for historical hours that never made it into a
 * real dated row (no raw Daily Score/Challenge submission exists to attach
 * them to, so inventing one would fabricate every other field on that row —
 * see base44Checkpoints.js). This is only ever safe to add to a WHOLE-period
 * total whose start reaches back on/before checkpoint_date, matched with
 * excluding real rows dated on/before checkpoint_date from the raw sum
 * (same pattern as the Challenge-points checkpoint) — never to a per-day
 * breakdown, which has no way to honestly place an aggregate on one day.
 * Every caller here computes a whole-period total, so this is safe
 * everywhere it's applied; a caller needing a day-by-day trend must keep
 * reading raw rows directly and simply won't show the checkpoint's
 * contribution as any single day's bar, which is the honest outcome.
 */
import { query } from '../db.js';
import { PROJECT_WORK_LAUNCH_DATE } from '../config/constants.js';
import { getCheckpointForUser, getAllCheckpoints } from '../repositories/base44Checkpoints.js';

/** One user, one period. Returns total minutes (legacy hours -> minutes,
 * rounded, + current minutes, + any applicable checkpoint minutes), never
 * negative, never fabricated. */
export async function resolveVolunteerMinutesForUser(userId, startDate, endDate) {
  const checkpoint = await getCheckpointForUser(userId);
  const cpDate = checkpoint?.volunteer_minutes_checkpoint != null && startDate <= checkpoint.checkpoint_date
    ? checkpoint.checkpoint_date
    : null;

  const [legacyRes, currentRes] = await Promise.all([
    query(
      `select coalesce(sum(volunteer_hours), 0)::float as hours
         from daily_scores
        where user_id = $1 and date between $2 and $3 and date < $4
          and date > coalesce($5::date, '1899-12-31'::date)`,
      [userId, startDate, endDate, PROJECT_WORK_LAUNCH_DATE, cpDate]
    ),
    query(
      `select coalesce(sum(project_minutes), 0)::int as minutes
         from summer_entries
        where user_id = $1 and date between $2 and $3 and date >= $4
          and date > coalesce($5::date, '1899-12-31'::date)`,
      [userId, startDate, endDate, PROJECT_WORK_LAUNCH_DATE, cpDate]
    ),
  ]);
  const legacyMinutes = Math.round(Number(legacyRes.rows[0].hours) * 60);
  const checkpointMinutes = cpDate ? checkpoint.volunteer_minutes_checkpoint : 0;
  return legacyMinutes + currentRes.rows[0].minutes + checkpointMinutes;
}

/**
 * Whole-program breakdown for a period — one pair of GROUP BY queries
 * (never N+1 per participant), merged in JS. Scoped to
 * system_role='participant' to match every other HQ program-total query.
 * Returns { totalMinutes, byUser: Map<user_id, minutes> }.
 */
export async function resolveVolunteerMinutesForProgram(startDate, endDate) {
  const checkpoints = await getAllCheckpoints();

  const [legacyRes, currentRes] = await Promise.all([
    query(
      `select ds.user_id, coalesce(sum(ds.volunteer_hours), 0)::float as hours
         from daily_scores ds
         join users u on u.id = ds.user_id
         left join base44_checkpoints bc on bc.user_id = ds.user_id and bc.volunteer_minutes_checkpoint is not null and $1 <= bc.checkpoint_date
        where u.system_role = 'participant' and ds.date between $1 and $2 and ds.date < $3
          and ds.date > coalesce(bc.checkpoint_date, '1899-12-31'::date)
        group by ds.user_id`,
      [startDate, endDate, PROJECT_WORK_LAUNCH_DATE]
    ),
    query(
      `select se.user_id, coalesce(sum(se.project_minutes), 0)::int as minutes
         from summer_entries se
         join users u on u.id = se.user_id
         left join base44_checkpoints bc on bc.user_id = se.user_id and bc.volunteer_minutes_checkpoint is not null and $1 <= bc.checkpoint_date
        where u.system_role = 'participant' and se.date between $1 and $2 and se.date >= $3
          and se.date > coalesce(bc.checkpoint_date, '1899-12-31'::date)
        group by se.user_id`,
      [startDate, endDate, PROJECT_WORK_LAUNCH_DATE]
    ),
  ]);

  const byUser = new Map();
  for (const row of legacyRes.rows) {
    byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + Math.round(Number(row.hours) * 60));
  }
  for (const row of currentRes.rows) {
    byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + row.minutes);
  }
  // Add each checkpointed user's baseline exactly once, only for a query
  // window whose start reaches back on/before their checkpoint_date — see
  // resolveVolunteerMinutesForUser's cpDate gate for why that's required.
  for (const [userId, cp] of checkpoints) {
    if (cp.volunteer_minutes_checkpoint != null && startDate <= cp.checkpoint_date) {
      byUser.set(userId, (byUser.get(userId) || 0) + cp.volunteer_minutes_checkpoint);
    }
  }

  let totalMinutes = 0;
  for (const minutes of byUser.values()) totalMinutes += minutes;
  return { totalMinutes, byUser };
}

export function minutesToHours(minutes) {
  return Math.round((minutes / 60) * 10) / 10;
}
