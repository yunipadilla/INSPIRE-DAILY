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
 */
import { query } from '../db.js';
import { PROJECT_WORK_LAUNCH_DATE } from '../config/constants.js';

/** One user, one period. Returns total minutes (legacy hours -> minutes,
 * rounded, + current minutes), never negative, never fabricated. */
export async function resolveVolunteerMinutesForUser(userId, startDate, endDate) {
  const [legacyRes, currentRes] = await Promise.all([
    query(
      `select coalesce(sum(volunteer_hours), 0)::float as hours
         from daily_scores
        where user_id = $1 and date between $2 and $3 and date < $4`,
      [userId, startDate, endDate, PROJECT_WORK_LAUNCH_DATE]
    ),
    query(
      `select coalesce(sum(project_minutes), 0)::int as minutes
         from summer_entries
        where user_id = $1 and date between $2 and $3 and date >= $4`,
      [userId, startDate, endDate, PROJECT_WORK_LAUNCH_DATE]
    ),
  ]);
  const legacyMinutes = Math.round(Number(legacyRes.rows[0].hours) * 60);
  return legacyMinutes + currentRes.rows[0].minutes;
}

/**
 * Whole-program breakdown for a period — one pair of GROUP BY queries
 * (never N+1 per participant), merged in JS. Scoped to
 * system_role='participant' to match every other HQ program-total query.
 * Returns { totalMinutes, byUser: Map<user_id, minutes> }.
 */
export async function resolveVolunteerMinutesForProgram(startDate, endDate) {
  const [legacyRes, currentRes] = await Promise.all([
    query(
      `select ds.user_id, coalesce(sum(ds.volunteer_hours), 0)::float as hours
         from daily_scores ds
         join users u on u.id = ds.user_id
        where u.system_role = 'participant' and ds.date between $1 and $2 and ds.date < $3
        group by ds.user_id`,
      [startDate, endDate, PROJECT_WORK_LAUNCH_DATE]
    ),
    query(
      `select se.user_id, coalesce(sum(se.project_minutes), 0)::int as minutes
         from summer_entries se
         join users u on u.id = se.user_id
        where u.system_role = 'participant' and se.date between $1 and $2 and se.date >= $3
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

  let totalMinutes = 0;
  for (const minutes of byUser.values()) totalMinutes += minutes;
  return { totalMinutes, byUser };
}

export function minutesToHours(minutes) {
  return Math.round((minutes / 60) * 10) / 10;
}
