import { query } from '../../db.js';
import { ptDateString, currentMonthBoundsPT } from '../../config/pacificTime.js';
import { windowBounds, scaffoldDays } from './metricsHelpers.js';

/**
 * `daily_scores.volunteer_hours` is the single authoritative source for
 * volunteer hours in the rebuilt app (confirmed during the Base44 migration
 * work — SummerEntry's own volunteer_hours field has no rebuilt column to
 * land in, and TaskSignup.hours_spent is a distinct concept, task hours, not
 * volunteer hours). Never sum more than one source here.
 */
export async function getVolunteerHoursOverview({ days = 30 } = {}) {
  const today = ptDateString();
  const { start } = windowBounds(days, today);
  const { start: monthStart, end: monthEnd } = currentMonthBoundsPT();

  const [totalsRes, trendRes] = await Promise.all([
    query(
      `select coalesce(sum(ds.volunteer_hours), 0)::float as total,
              coalesce(sum(ds.volunteer_hours) filter (where ds.date between $1 and $2), 0)::float as this_month
         from daily_scores ds join users u on u.id = ds.user_id
        where u.system_role = 'participant'`,
      [monthStart, monthEnd]
    ),
    query(
      `select ds.date::text as day, coalesce(sum(ds.volunteer_hours), 0)::float as hours
         from daily_scores ds join users u on u.id = ds.user_id
        where ds.date between $1 and $2 and u.system_role = 'participant'
        group by ds.date`,
      [start, today]
    ),
  ]);

  const byDay = new Map(trendRes.rows.map((r) => [r.day, r.hours]));
  const trend = scaffoldDays(start, today).map((day) => ({ date: day, hours: byDay.get(day) || 0 }));

  return {
    totalHours: totalsRes.rows[0].total,
    hoursThisMonth: totalsRes.rows[0].this_month,
    trend,
  };
}

export async function listVolunteerHoursMembers({ search, appRole, page = 1, pageSize = 20 } = {}) {
  const { start: monthStart, end: monthEnd } = currentMonthBoundsPT();
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
              coalesce((select sum(volunteer_hours) from daily_scores where user_id = u.id), 0)::float as total_hours,
              coalesce((select sum(volunteer_hours) from daily_scores where user_id = u.id and date between $${i} and $${i + 1}), 0)::float as month_hours,
              (select max(date) from daily_scores where user_id = u.id and volunteer_hours > 0) as last_activity
         from users u
        where ${where}
        order by total_hours desc nulls last, u.first_name asc
        limit $${i + 2} offset $${i + 3}`,
      [...params, monthStart, monthEnd, safePageSize, offset]
    ),
    query(`select count(*)::int as count from users u where ${where}`, params),
  ]);

  const rows = rowsRes.rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    totalHours: r.total_hours,
    monthHours: r.month_hours,
    lastActivity: r.last_activity,
  }));

  return { rows, total: countRes.rows[0].count, page: safePage, pageSize: safePageSize };
}
