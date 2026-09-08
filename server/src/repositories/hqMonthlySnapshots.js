import { query } from '../db.js';

export async function getSnapshot(year, month) {
  const { rows } = await query('select * from hq_monthly_snapshots where year = $1 and month = $2', [year, month]);
  return rows[0] || null;
}

/** UNIQUE(year, month) makes this a true upsert — refreshing the current (or
 * any) month's snapshot always updates the same one row, never inserts a
 * second. `source_version` increments on every write, giving a lightweight
 * audit trail of how many times a given month has been (re)computed. */
export async function upsertSnapshot({
  year, month, totalVolunteerMinutes, totalChallengePoints, participantCount, challengeDaysLogged,
}) {
  const { rows } = await query(
    `insert into hq_monthly_snapshots
       (year, month, total_volunteer_minutes, total_challenge_points, participant_count, challenge_days_logged)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (year, month) do update set
       total_volunteer_minutes = excluded.total_volunteer_minutes,
       total_challenge_points = excluded.total_challenge_points,
       participant_count = excluded.participant_count,
       challenge_days_logged = excluded.challenge_days_logged,
       updated_at = now(),
       source_version = hq_monthly_snapshots.source_version + 1
     returning *`,
    [year, month, totalVolunteerMinutes, totalChallengePoints, participantCount, challengeDaysLogged]
  );
  return rows[0];
}
