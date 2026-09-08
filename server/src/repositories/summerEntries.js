import { query } from '../db.js';

export async function findByUserAndDate(userId, date) {
  const { rows } = await query('select * from summer_entries where user_id = $1 and date = $2', [
    userId,
    date,
  ]);
  return rows[0] || null;
}

export async function insertSummerEntry(userId, date, values, totalPoints) {
  const { rows } = await query(
    `insert into summer_entries
      (user_id, date, sleep_bed_before_10, sleep_8h, hydration, exercise, screen_time_tier,
       mindfulness_sessions, reading_sessions, daily_update_sent, nutrition, cold_plunge_type, project_minutes, total_points)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning *`,
    [
      userId,
      date,
      values.sleepBedBefore10,
      values.sleep8h,
      values.hydration,
      values.exercise,
      values.screenTimeTier || null,
      values.mindfulnessSessions || 0,
      values.readingSessions || 0,
      values.dailyUpdateSent,
      values.nutrition,
      values.coldPlungeType || null,
      values.projectMinutes || 0,
      totalPoints,
    ]
  );
  return rows[0];
}

/**
 * The current Challenge period's ranked leaderboard — the one place real
 * standings (and, per the printed prize structure, real prizes) are
 * decided, so this is the query where an approved Base44 checkpoint (see
 * repositories/base44Checkpoints.js) matters most. For a user with no
 * checkpoint — the overwhelming majority — `bc.*` is all NULL and this
 * reduces to exactly the previous unconditional period sum, zero behavior
 * change. For a checkpointed user, entries dated on/before their
 * checkpoint_date are excluded from the raw sum (they're already
 * represented by challenge_points_checkpoint) and only genuinely new
 * post-checkpoint entries are added on top — preventing double-counting by
 * construction, never by guessing which specific rows "already count."
 */
export async function monthlySummerLeaderboard(startDate, endDate) {
  const periodKey = startDate.slice(0, 7);
  const { rows } = await query(
    `select u.id, u.first_name, u.last_name, u.app_role, u.profile_photo_url,
            coalesce(bc.challenge_points_checkpoint, 0) + coalesce((
              select sum(se2.total_points) from summer_entries se2
               where se2.user_id = u.id
                 and se2.date between $1 and $2
                 and se2.date > coalesce(bc.checkpoint_date, '1899-12-31'::date)
            ), 0)::numeric as score
     from users u
     left join base44_checkpoints bc on bc.user_id = u.id and bc.challenge_period = $3
     where u.app_role in ('intern','postgrad') and u.account_status = 'approved'
     order by score desc, u.first_name asc`,
    [startDate, endDate, periodKey]
  );
  return rows;
}
