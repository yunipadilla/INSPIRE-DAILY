import { query } from '../../db.js';
import { ptDateString } from '../../config/pacificTime.js';
import { windowBounds, scaffoldDays } from './metricsHelpers.js';

const GOAL_TYPES = ['reading', 'fitness_daily', 'fitness_weekly', 'learning', 'meditation', 'custom'];

export async function getGoalsOverview({ days = 30 } = {}) {
  const today = ptDateString();
  const { start } = windowBounds(days, today);

  const [totalsRes, byTypeRes, trendRes] = await Promise.all([
    query(
      `select count(*) filter (where g.completed = false)::int as active,
              count(*) filter (where g.completed = true)::int as completed,
              count(*)::int as total
         from goals g join users u on u.id = g.user_id
        where u.system_role = 'participant'`
    ),
    query(
      `select g.type, count(*) filter (where g.completed = false)::int as active,
              count(*) filter (where g.completed = true)::int as completed
         from goals g join users u on u.id = g.user_id
        where u.system_role = 'participant'
        group by g.type`
    ),
    query(
      `select g.completed_date::text as day, count(*)::int as completions
         from goals g join users u on u.id = g.user_id
        where g.completed = true and g.completed_date between $1 and $2 and u.system_role = 'participant'
        group by g.completed_date`,
      [start, today]
    ),
  ]);

  const byType = Object.fromEntries(GOAL_TYPES.map((t) => [t, { active: 0, completed: 0 }]));
  for (const r of byTypeRes.rows) byType[r.type] = { active: r.active, completed: r.completed };

  const byDay = new Map(trendRes.rows.map((r) => [r.day, r.completions]));
  const trend = scaffoldDays(start, today).map((day) => ({ date: day, completions: byDay.get(day) || 0 }));

  const { active, completed, total } = totalsRes.rows[0];
  return {
    activeGoals: active,
    completedGoals: completed,
    totalGoals: total,
    completionRate: total > 0 ? completed / total : null,
    byType,
    trend,
  };
}

export async function listGoalsMembers({ search, appRole, page = 1, pageSize = 20 } = {}) {
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
              (select count(*) from goals where user_id = u.id and completed = false)::int as active_goals,
              (select count(*) from goals where user_id = u.id and completed = true)::int as completed_goals,
              (select max(updated_at) from goals where user_id = u.id) as last_goal_activity
         from users u
        where ${where}
        order by u.first_name asc
        limit $${i} offset $${i + 1}`,
      [...params, safePageSize, offset]
    ),
    query(`select count(*)::int as count from users u where ${where}`, params),
  ]);

  const rows = rowsRes.rows.map((r) => {
    const total = r.active_goals + r.completed_goals;
    return {
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      activeGoals: r.active_goals,
      completedGoals: r.completed_goals,
      completionRate: total > 0 ? r.completed_goals / total : null,
      lastGoalActivity: r.last_goal_activity,
    };
  });

  return { rows, total: countRes.rows[0].count, page: safePage, pageSize: safePageSize };
}
