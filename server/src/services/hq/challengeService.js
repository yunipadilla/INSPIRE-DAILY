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

  const periodKey = monthStart.slice(0, 7);
  const [totalsRes, pointsRes, categoryRes, trendRes] = await Promise.all([
    // Scoped to the selected/current Challenge period (monthStart..monthEnd)
    // — this used to be an unbounded all-time sum despite currentMonth being
    // computed right below, which is exactly the "~219 points on day 3"
    // inflation bug: historical June–August entries were silently included
    // in what the UI presented as the current period's totals.
    //
    // total_points is computed per-user (a checkpointed person's pre-
    // checkpoint entries are replaced by their checkpoint value, never
    // summed alongside it — same rule as monthlySummerLeaderboard, applied
    // here as a per-user derived table so the aggregate can't double-count).
    // participants/active_days/entries stay real-row-only — descriptive
    // program-activity counts, not the prize-determining figure.
    query(
      `select count(distinct se.user_id)::int as participants,
              count(distinct se.date)::int as active_days,
              count(*)::int as entries
         from summer_entries se join users u on u.id = se.user_id
        where u.system_role = 'participant' and se.date between $1 and $2`,
      [monthStart, monthEnd]
    ),
    query(
      `select coalesce(sum(resolved.points), 0)::numeric as total_points
         from (
           select coalesce(bc.challenge_points_checkpoint, 0) + coalesce((
                    select sum(se2.total_points) from summer_entries se2
                     where se2.user_id = u.id
                       and se2.date between $1 and $2
                       and se2.date > coalesce(bc.checkpoint_date, '1899-12-31'::date)
                  ), 0) as points
             from users u
             left join base44_checkpoints bc on bc.user_id = u.id and bc.challenge_period = $3
            where u.system_role = 'participant'
         ) resolved`,
      [monthStart, monthEnd, periodKey]
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
  const totalPoints = Number(pointsRes.rows[0].total_points);
  return {
    participants: totals.participants,
    totalPoints,
    activeDays: totals.active_days,
    avgPointsPerEntry: totals.entries > 0 ? totalPoints / totals.entries : 0,
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

  // All-time total: real entries OUTSIDE the checkpointed month (June/July/
  // August, unaffected) + the checkpoint value itself + real entries INSIDE
  // that month dated after the checkpoint. A user with no checkpoint has
  // bc.challenge_period null, which makes every entry count as "outside the
  // checkpointed month" — i.e. exactly the old plain all-time sum, zero
  // behavior change.
  const [rowsRes, countRes] = await Promise.all([
    query(
      `select u.id, u.first_name, u.last_name,
              (
                coalesce((select sum(se.total_points) from summer_entries se
                           where se.user_id = u.id
                             and (bc.challenge_period is null or to_char(se.date, 'YYYY-MM') <> bc.challenge_period)), 0)
                + coalesce(bc.challenge_points_checkpoint, 0)
                + coalesce((select sum(se2.total_points) from summer_entries se2
                             where se2.user_id = u.id and bc.challenge_period is not null
                               and to_char(se2.date, 'YYYY-MM') = bc.challenge_period
                               and se2.date > bc.checkpoint_date), 0)
              )::numeric as total_points,
              (
                coalesce((select count(*) from summer_entries se3
                           where se3.user_id = u.id
                             and (bc.challenge_period is null or to_char(se3.date, 'YYYY-MM') <> bc.challenge_period)), 0)
                + coalesce(bc.challenge_days_checkpoint, 0)
                + coalesce((select count(*) from summer_entries se4
                             where se4.user_id = u.id and bc.challenge_period is not null
                               and to_char(se4.date, 'YYYY-MM') = bc.challenge_period
                               and se4.date > bc.checkpoint_date), 0)
              )::int as days_logged,
              (select max(date) from summer_entries where user_id = u.id) as last_activity
         from users u
         left join base44_checkpoints bc on bc.user_id = u.id
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

