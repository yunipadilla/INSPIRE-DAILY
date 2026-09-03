import { query } from '../../db.js';
import { ptDateString, currentMonthBoundsPT } from '../../config/pacificTime.js';
import { monthlySummerLeaderboard } from '../../repositories/summerEntries.js';
import { windowBounds, scaffoldDays } from './metricsHelpers.js';

/** Resolves a `month=YYYY-MM` query param to bounds, defaulting to the
 * current program month — this is how "monthly winners" stays computed
 * from real data instead of a hardcoded season, per Inspire Challenge's
 * generalized (no longer "Summer 2026"-specific) framing. */
export function resolveMonthBounds(monthParam) {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const start = `${monthParam}-01`;
    const [y, m] = monthParam.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { start, end: `${monthParam}-${String(lastDay).padStart(2, '0')}` };
  }
  return currentMonthBoundsPT();
}

export async function getChallengeOverview({ days = 30, month } = {}) {
  const today = ptDateString();
  const { start } = windowBounds(days, today);
  const { start: monthStart, end: monthEnd } = resolveMonthBounds(month);

  const [totalsRes, categoryRes, trendRes] = await Promise.all([
    // Scoped to the selected/current Challenge period (monthStart..monthEnd)
    // — this used to be an unbounded all-time sum despite currentMonth being
    // computed right below, which is exactly the "~219 points on day 3"
    // inflation bug: historical June–August entries were silently included
    // in what the UI presented as the current period's totals.
    query(
      `select count(distinct se.user_id)::int as participants,
              coalesce(sum(se.total_points), 0)::numeric as total_points,
              count(distinct se.date)::int as active_days,
              count(*)::int as entries
         from summer_entries se join users u on u.id = se.user_id
        where u.system_role = 'participant' and se.date between $1 and $2`,
      [monthStart, monthEnd]
    ),
    query(
      `select
         avg(case when sleep_bed_before_10 then 1 else 0 end)::float as sleep_bed_before_10,
         avg(case when hydration then 1 else 0 end)::float as hydration,
         avg(case when exercise then 1 else 0 end)::float as exercise,
         avg(case when nutrition then 1 else 0 end)::float as nutrition,
         avg(case when daily_update_sent then 1 else 0 end)::float as daily_update_sent,
         avg(mindfulness_sessions)::float as mindfulness_sessions,
         avg(reading_sessions)::float as reading_sessions,
         count(*) filter (where cold_plunge_type = 'plunge')::int as cold_plunge_count,
         count(*) filter (where cold_plunge_type = 'shower')::int as cold_shower_count
         from summer_entries se join users u on u.id = se.user_id
        where u.system_role = 'participant' and se.date between $1 and $2`,
      [monthStart, monthEnd]
    ),
    query(
      `select se.date::text as day, count(*)::int as submissions, coalesce(sum(se.total_points), 0)::numeric as points
         from summer_entries se join users u on u.id = se.user_id
        where se.date between $1 and $2 and u.system_role = 'participant'
        group by se.date`,
      [start, today]
    ),
  ]);

  const byDay = new Map(trendRes.rows.map((r) => [r.day, r]));
  const trend = scaffoldDays(start, today).map((day) => {
    const row = byDay.get(day);
    return { date: day, submissions: row ? row.submissions : 0, points: row ? Number(row.points) : 0 };
  });

  const totals = totalsRes.rows[0];
  return {
    participants: totals.participants,
    totalPoints: Number(totals.total_points),
    activeDays: totals.active_days,
    avgPointsPerEntry: totals.entries > 0 ? Number(totals.total_points) / totals.entries : 0,
    categoryParticipation: categoryRes.rows[0],
    trend,
    currentMonth: { start: monthStart, end: monthEnd },
  };
}

/** Full ranked list (not just top 5) — reuses the exact same canonical
 * repository function the participant-facing leaderboard uses. */
export async function getChallengeLeaderboard({ month } = {}) {
  const { start, end } = resolveMonthBounds(month);
  const rows = await monthlySummerLeaderboard(start, end);
  return rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    appRole: r.app_role,
    profilePhotoUrl: r.profile_photo_url,
    score: Number(r.score),
  }));
}

/** Per-participant table: rank/points/days logged/avg per day/last activity
 * for the whole program (all-time), independent of the monthly leaderboard. */
export async function listChallengeMembers({ search, appRole, page = 1, pageSize = 20 } = {}) {
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
      `select u.id, u.first_name, u.last_name,
              coalesce((select sum(total_points) from summer_entries where user_id = u.id), 0)::numeric as total_points,
              (select count(*) from summer_entries where user_id = u.id)::int as days_logged,
              (select max(date) from summer_entries where user_id = u.id) as last_activity
         from users u
        where ${where}
        order by total_points desc nulls last, u.first_name asc
        limit $${i} offset $${i + 1}`,
      [...params, safePageSize, offset]
    ),
    query(`select count(*)::int as count from users u where ${where}`, params),
  ]);

  const rows = rowsRes.rows.map((r, idx) => ({
    rank: offset + idx + 1,
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    totalPoints: Number(r.total_points),
    daysLogged: r.days_logged,
    avgPointsPerDay: r.days_logged > 0 ? Number(r.total_points) / r.days_logged : 0,
    lastActivity: r.last_activity,
  }));

  return { rows, total: countRes.rows[0].count, page: safePage, pageSize: safePageSize };
}

