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
       mindfulness_sessions, reading_sessions, daily_update_sent, nutrition, cold_plunge_type, total_points)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
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
      totalPoints,
    ]
  );
  return rows[0];
}

export async function monthlySummerLeaderboard(startDate, endDate) {
  const { rows } = await query(
    `select u.id, u.first_name, u.last_name, u.app_role, u.profile_photo_url,
            coalesce(sum(se.total_points), 0)::numeric as score
     from users u
     left join summer_entries se on se.user_id = u.id and se.date between $1 and $2
     where u.app_role in ('intern','postgrad') and u.account_status = 'approved'
     group by u.id, u.first_name, u.last_name, u.app_role, u.profile_photo_url
     order by score desc, u.first_name asc`,
    [startDate, endDate]
  );
  return rows;
}
