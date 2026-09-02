import { query } from '../../db.js';
import { ptDateString, isSundayPT, addDays } from '../../config/pacificTime.js';
import { windowBounds, nonRestDayCount, scaffoldDays } from './metricsHelpers.js';

const ATTENTION_NO_SUBMISSION_DAYS = 3;

/** Program-wide Daily Scores dashboard: today's state, streak health, and a
 * submissions/average-sliders trend series over the requested window. */
export async function getDailyScoresOverview({ days = 30 } = {}) {
  const today = ptDateString();
  const sunday = isSundayPT();
  const { start } = windowBounds(days, today);

  const [participantsRes, todayRes, streakRes, missingRes, avgFieldsRes, trendRes] = await Promise.all([
    query(`select count(*)::int as count from users where system_role = 'participant' and account_status = 'approved'`),

    sunday
      ? Promise.resolve({ rows: [{ count: 0 }] })
      : query(
          `select count(*)::int as count from daily_scores ds join users u on u.id = ds.user_id
           where ds.date = $1 and u.system_role = 'participant' and u.account_status = 'approved'`,
          [today]
        ),

    query(
      `select count(*) filter (where streak_count > 0)::int as active_streaks,
              coalesce(avg(streak_count) filter (where streak_count > 0), 0)::float as avg_streak
         from users where system_role = 'participant' and account_status = 'approved'`
    ),

    query(
      `select count(*)::int as count from users u
        where u.system_role = 'participant' and u.account_status = 'approved'
          and not exists (
            select 1 from daily_scores ds where ds.user_id = u.id and ds.date >= ($1::date - make_interval(days => $2))
          )`,
      [today, ATTENTION_NO_SUBMISSION_DAYS]
    ),

    query(
      `select avg(best_self)::float as best_self, avg(ceo_mindset)::float as ceo_mindset, avg(grit)::float as grit,
              avg(happiness)::float as happiness, avg(sleep)::float as sleep
         from daily_scores ds join users u on u.id = ds.user_id
        where ds.date between $1 and $2 and u.system_role = 'participant'`,
      [start, today]
    ),

    query(
      `select ds.date::text as day, count(*)::int as submissions,
              avg(best_self)::float as best_self, avg(ceo_mindset)::float as ceo_mindset, avg(grit)::float as grit,
              avg(happiness)::float as happiness, avg(sleep)::float as sleep
         from daily_scores ds join users u on u.id = ds.user_id
        where ds.date between $1 and $2 and u.system_role = 'participant'
        group by ds.date`,
      [start, today]
    ),
  ]);

  const participantCount = participantsRes.rows[0].count;
  const byDay = new Map(trendRes.rows.map((r) => [r.day, r]));
  const trend = scaffoldDays(start, today).map((day) => {
    const row = byDay.get(day);
    return {
      date: day,
      submissions: row ? row.submissions : 0,
      bestSelf: row ? Number(row.best_self) : 0,
      ceoMindset: row ? Number(row.ceo_mindset) : 0,
      grit: row ? Number(row.grit) : 0,
      happiness: row ? Number(row.happiness) : 0,
      sleep: row ? Number(row.sleep) : 0,
    };
  });

  return {
    isSunday: sunday,
    participantCount,
    submittedToday: todayRes.rows[0].count,
    pendingToday: sunday ? 0 : Math.max(0, participantCount - todayRes.rows[0].count),
    participationRateToday: !sunday && participantCount > 0 ? todayRes.rows[0].count / participantCount : null,
    activeStreakCount: streakRes.rows[0].active_streaks,
    averageStreak: streakRes.rows[0].avg_streak,
    missing3PlusDays: missingRes.rows[0].count,
    windowAverages: {
      bestSelf: avgFieldsRes.rows[0].best_self || 0,
      ceoMindset: avgFieldsRes.rows[0].ceo_mindset || 0,
      grit: avgFieldsRes.rows[0].grit || 0,
      happiness: avgFieldsRes.rows[0].happiness || 0,
      sleep: avgFieldsRes.rows[0].sleep || 0,
    },
    trend,
  };
}

/** One row per participant for the Daily Scores member table — a single
 * query with subqueries, no N+1 per-row round trips. */
export async function listDailyScoresMembers({ search, appRole, page = 1, pageSize = 20 } = {}) {
  const today = ptDateString();
  const conditions = [`u.system_role = 'participant'`];
  const params = [];
  let i = 1;
  if (search) {
    conditions.push(`(u.first_name ilike $${i} or u.last_name ilike $${i} or u.email ilike $${i})`);
    params.push(`%${search}%`);
    i += 1;
  }
  if (appRole) {
    conditions.push(`u.app_role = $${i}`);
    params.push(appRole);
    i += 1;
  }
  const where = conditions.join(' and ');
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const offset = (safePage - 1) * safePageSize;

  const [rowsRes, countRes] = await Promise.all([
    query(
      `select u.id, u.first_name, u.last_name, u.streak_count,
              exists(select 1 from daily_scores where user_id = u.id and date = $${i}) as submitted_today,
              (select max(date) from daily_scores where user_id = u.id) as last_submission,
              (select count(*) from daily_scores where user_id = u.id and date >= $${i}::date - 6)::int as last7_count,
              (select count(*) from daily_scores where user_id = u.id and date >= $${i}::date - 29)::int as last30_count
         from users u
        where ${where}
        order by u.first_name asc
        limit $${i + 1} offset $${i + 2}`,
      [...params, today, safePageSize, offset]
    ),
    query(`select count(*)::int as count from users u where ${where}`, params),
  ]);

  const denom7 = nonRestDayCount(addDays(today, -6), today);
  const denom30 = nonRestDayCount(addDays(today, -29), today);
  const rows = rowsRes.rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    streakCount: r.streak_count,
    submittedToday: r.submitted_today,
    lastSubmission: r.last_submission,
    completion7d: denom7 > 0 ? Math.min(1, r.last7_count / denom7) : null,
    completion30d: denom30 > 0 ? Math.min(1, r.last30_count / denom30) : null,
  }));

  return { rows, total: countRes.rows[0].count, page: safePage, pageSize: safePageSize };
}
