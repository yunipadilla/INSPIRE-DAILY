import { query } from '../db.js';

export async function findByUserAndDate(userId, date) {
  const { rows } = await query('select * from daily_scores where user_id = $1 and date = $2', [
    userId,
    date,
  ]);
  return rows[0] || null;
}

export async function listDatesForUser(userId, limit = 400) {
  const { rows } = await query(
    'select date::text as date from daily_scores where user_id = $1 order by date desc limit $2',
    [userId, limit]
  );
  return rows.map((r) => r.date);
}

export async function insertDailyScore(userId, date, values) {
  const total = values.bestSelf + values.ceoMindset + values.grit + values.happiness + values.sleep;

  const { rows } = await query(
    `insert into daily_scores
      (user_id, date, display_name, challenges, earned_way, volunteer_hours,
       best_self, ceo_mindset, grit, happiness, sleep, goals_worked_on, total_score, points)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
     returning *`,
    [
      userId,
      date,
      values.displayName,
      values.challenges || null,
      values.earnedWay,
      values.volunteerHours,
      values.bestSelf,
      values.ceoMindset,
      values.grit,
      values.happiness,
      values.sleep,
      values.goalsWorkedOn || null,
      total,
    ]
  );
  return rows[0];
}
