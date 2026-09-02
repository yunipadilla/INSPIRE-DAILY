import { query } from '../../db.js';
import { ptDateString } from '../../config/pacificTime.js';
import { windowBounds, scaffoldDays } from './metricsHelpers.js';

export async function getTasksOverview({ days = 30 } = {}) {
  const today = ptDateString();
  const { start } = windowBounds(days, today);

  const [totalsRes, trendRes] = await Promise.all([
    query(
      `select count(*)::int as total,
              count(*) filter (where ts.status = 'in_progress')::int as in_progress,
              count(*) filter (where ts.status = 'completed')::int as completed,
              coalesce(sum(ts.hours_spent) filter (where ts.status = 'completed'), 0)::float as total_hours
         from task_signups ts join users u on u.id = ts.user_id
        where u.system_role = 'participant'`
    ),
    query(
      `select ts.completed_date::text as day, count(*)::int as completions, coalesce(sum(ts.hours_spent), 0)::float as hours
         from task_signups ts join users u on u.id = ts.user_id
        where ts.status = 'completed' and ts.completed_date between $1 and $2 and u.system_role = 'participant'
        group by ts.completed_date`,
      [start, today]
    ),
  ]);

  const byDay = new Map(trendRes.rows.map((r) => [r.day, r]));
  const trend = scaffoldDays(start, today).map((day) => {
    const row = byDay.get(day);
    return { date: day, completions: row ? row.completions : 0, hours: row ? row.hours : 0 };
  });

  return { ...totalsRes.rows[0], trend };
}

/** Grouped-by-person view: every participant with at least one signup,
 * their task list (title/status/level/hours/notes) attached. */
export async function listTasksMembers({ status, search, appRole, page = 1, pageSize = 20 } = {}) {
  const conditions = [`u.system_role = 'participant'`, `exists (select 1 from task_signups where user_id = u.id)`];
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
      `select u.id, u.first_name, u.last_name, u.app_role,
              (select count(*) from task_signups where user_id = u.id)::int as total,
              (select count(*) from task_signups where user_id = u.id and status = 'in_progress')::int as in_progress,
              (select count(*) from task_signups where user_id = u.id and status = 'completed')::int as completed,
              coalesce((select sum(hours_spent) from task_signups where user_id = u.id and status = 'completed'), 0)::float as hours
         from users u
        where ${where}
        order by u.first_name asc
        limit $${i} offset $${i + 1}`,
      [...params, safePageSize, offset]
    ),
    query(`select count(*)::int as count from users u where ${where}`, params),
  ]);

  let members = rowsRes.rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    appRole: r.app_role,
    total: r.total,
    inProgress: r.in_progress,
    completed: r.completed,
    hours: r.hours,
  }));
  if (status === 'in_progress') members = members.filter((m) => m.inProgress > 0);
  if (status === 'completed') members = members.filter((m) => m.completed > 0);

  return { rows: members, total: countRes.rows[0].count, page: safePage, pageSize: safePageSize };
}

export async function getMemberTaskDetail(userId) {
  const { rows } = await query(
    `select ts.id, ts.status, ts.hours_spent, ts.notes, ts.completed_date, ts.created_at, it.title, it.level
       from task_signups ts join internship_tasks it on it.id = ts.task_id
      where ts.user_id = $1 order by ts.created_at desc`,
    [userId]
  );
  return rows;
}
