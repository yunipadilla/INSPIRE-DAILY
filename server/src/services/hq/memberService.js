import { query } from '../../db.js';

// Whitelisted sort keys mapped to real column expressions — never interpolate
// a client-supplied string directly into ORDER BY.
const SORTABLE_COLUMNS = {
  name: 'u.first_name',
  email: 'u.email',
  streak: 'u.streak_count',
  createdAt: 'u.created_at',
  lastActivity: 'last_activity',
};

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Paginated, searchable, filterable, sortable member directory. Scoped to
 * system_role='participant' — Inspire HQ's "Members" is the participant
 * roster, not staff/admin accounts managing it. Every filter/sort value is
 * validated against a fixed whitelist before it ever reaches SQL.
 */
export async function listMembers({ search, appRole, accountStatus, sort, direction, page, pageSize }) {
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
  if (accountStatus) {
    conditions.push(`u.account_status = $${i}`);
    params.push(accountStatus);
    i += 1;
  }

  const sortColumn = SORTABLE_COLUMNS[sort] || SORTABLE_COLUMNS.createdAt;
  const sortDir = direction === 'asc' ? 'asc' : 'desc';
  const whereClause = conditions.join(' and ');
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const offset = (safePage - 1) * safePageSize;

  const limitParamIndex = i;
  const offsetParamIndex = i + 1;

  const [rowsRes, countRes] = await Promise.all([
    query(
      `select u.id, u.first_name, u.last_name, u.email, u.profile_photo_url, u.app_role, u.account_status,
              u.streak_count, u.streak_shields, u.created_at,
              (select max(ds.date) from daily_scores ds where ds.user_id = u.id) as last_activity
         from users u
        where ${whereClause}
        order by ${sortColumn} ${sortDir} nulls last, u.id
        limit $${limitParamIndex} offset $${offsetParamIndex}`,
      [...params, safePageSize, offset]
    ),
    query(`select count(*)::int as count from users u where ${whereClause}`, params),
  ]);

  return {
    members: rowsRes.rows,
    total: countRes.rows[0].count,
    page: safePage,
    pageSize: safePageSize,
  };
}

/**
 * Consolidated single-participant view — Daily Scores history, goals,
 * Challenge totals, task activity, badges, and a merged activity timeline.
 * Never returns password_hash or any token/secret field.
 */
export async function getMemberProfile(id) {
  const userRes = await query(
    `select id, first_name, last_name, email, phone, profile_photo_url, app_role, account_status,
            system_role, streak_count, streak_shields, streak_last_date, created_at, approved_at
       from users
      where id = $1 and system_role = 'participant'`,
    [id]
  );
  const user = userRes.rows[0];
  if (!user) return null;

  const [dailyScoresRes, goalsRes, challengeRes, tasksRes, badgesRes, timelineRes] = await Promise.all([
    query(
      `select date, total_score, best_self, ceo_mindset, grit, happiness, sleep, volunteer_hours
         from daily_scores where user_id = $1 order by date desc limit 30`,
      [id]
    ),
    query(
      `select id, type, name, completed, completed_date, target_date, created_at
         from goals where user_id = $1 order by created_at desc`,
      [id]
    ),
    query(
      `select coalesce(sum(total_points), 0)::numeric as total_points, count(*)::int as days_logged
         from summer_entries where user_id = $1`,
      [id]
    ),
    query(
      `select ts.id, ts.status, ts.hours_spent, ts.completed_date, ts.created_at, it.title, it.level
         from task_signups ts
         join internship_tasks it on it.id = ts.task_id
        where ts.user_id = $1
        order by ts.created_at desc`,
      [id]
    ),
    query(
      `select id, badge_type, name, description, icon_emoji, earned_date
         from badges where user_id = $1 order by earned_date desc`,
      [id]
    ),
    query(
      `(select 'daily_score' as type, ds.submitted_at as occurred_at,
               'Submitted Daily Scores (total: ' || ds.total_score || ')' as description
          from daily_scores ds where ds.user_id = $1
         order by ds.submitted_at desc limit 10)
       union all
       (select 'goal_completed', g.updated_at, 'Completed goal "' || g.name || '"'
          from goals g where g.user_id = $1 and g.completed = true
         order by g.updated_at desc limit 10)
       union all
       (select 'task_completed', ts.completed_date::timestamptz, 'Completed task "' || it.title || '"'
          from task_signups ts join internship_tasks it on it.id = ts.task_id
         where ts.user_id = $1 and ts.status = 'completed' and ts.completed_date is not null
         order by ts.completed_date desc limit 10)
       union all
       (select 'badge_earned', b.earned_date::timestamptz, 'Earned badge "' || b.name || '"'
          from badges b where b.user_id = $1
         order by b.earned_date desc limit 10)
       order by occurred_at desc
       limit 20`,
      [id]
    ),
  ]);

  return {
    user,
    dailyScores: dailyScoresRes.rows,
    goals: goalsRes.rows,
    challenge: challengeRes.rows[0],
    tasks: tasksRes.rows,
    badges: badgesRes.rows,
    timeline: timelineRes.rows,
  };
}
