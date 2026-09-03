import { query } from '../../db.js';
import { ptDateString, addDays } from '../../config/pacificTime.js';
// Shared Challenge-period resolver (Inspire 2.1 date-filter architecture) —
// the same function that already drives the HQ Challenge page's monthly
// leaderboard. Reused here so "current Challenge points" means the same
// thing everywhere in HQ, not a second parallel definition of "current."
import { resolveMonthBounds } from './challengeService.js';

// Whitelisted sort keys mapped to real column expressions — never interpolate
// a client-supplied string directly into ORDER BY.
const SORTABLE_COLUMNS = {
  name: 'u.first_name',
  email: 'u.email',
  streak: 'u.streak_count',
  createdAt: 'u.created_at',
  lastActivity: 'last_activity',
};

const ACTIVE_WINDOW_DAYS = 14;

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Paginated, searchable, filterable, sortable member directory. Scoped to
 * system_role='participant' — Inspire HQ's "Members" is the participant
 * roster, not staff/admin accounts managing it. Every filter/sort value is
 * validated against a fixed whitelist before it ever reaches SQL.
 *
 * `activityState` ('active'|'inactive') is a deterministic, documented rule
 * — a submission within the last 14 days counts as active — not a fuzzy
 * inference. Cohort filtering is intentionally not implemented: cohorts
 * don't exist in the schema yet (see INSPIRE_MASTER_CONTEXT.md §6/§17), so
 * the Members page shows a "coming soon" state instead of a fake filter.
 */
export async function listMembers({ search, appRole, accountStatus, activityState, sort, direction, page, pageSize }) {
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
  if (activityState === 'active' || activityState === 'inactive') {
    const activeCutoff = addDays(ptDateString(), -ACTIVE_WINDOW_DAYS);
    const cmp = activityState === 'active' ? '>=' : '<';
    conditions.push(
      `coalesce((select max(ds.date) from daily_scores ds where ds.user_id = u.id), '0001-01-01') ${cmp} $${i}::date`
    );
    params.push(activeCutoff);
    i += 1;
  }

  const sortColumn = SORTABLE_COLUMNS[sort] || SORTABLE_COLUMNS.createdAt;
  const sortDir = direction === 'asc' ? 'asc' : 'desc';
  const whereClause = conditions.join(' and ');
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));
  const offset = (safePage - 1) * safePageSize;

  // "Challenge pts" here is a roster at-a-glance column, unlabeled — per the
  // current-period display rule it must mean the active Challenge period,
  // never an all-time sum (that used to silently include every historical
  // month, which is exactly the "~219 points on day 3" bug).
  const { start: challengeStart, end: challengeEnd } = resolveMonthBounds();
  const challengeStartIndex = i;
  const challengeEndIndex = i + 1;
  const limitParamIndex = i + 2;
  const offsetParamIndex = i + 3;

  const [rowsRes, countRes] = await Promise.all([
    query(
      `select u.id, u.first_name, u.last_name, u.email, u.profile_photo_url, u.app_role, u.account_status,
              u.streak_count, u.streak_shields, u.created_at,
              (select max(ds.date) from daily_scores ds where ds.user_id = u.id) as last_activity,
              (select count(*) from goals where user_id = u.id and completed = false)::int as active_goals,
              (select count(*) from badges where user_id = u.id)::int as badge_count,
              coalesce((select sum(total_points) from summer_entries
                         where user_id = u.id and date between $${challengeStartIndex} and $${challengeEndIndex}), 0)::numeric as challenge_points
         from users u
        where ${whereClause}
        order by ${sortColumn} ${sortDir} nulls last, u.id
        limit $${limitParamIndex} offset $${offsetParamIndex}`,
      [...params, challengeStart, challengeEnd, safePageSize, offset]
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

  // Current Challenge period — same shared resolver the HQ Challenge page's
  // monthly leaderboard uses. `challenge` below means THIS period, never an
  // all-time sum; `challengeAllTime` is the separate, explicitly-labeled
  // all-time figure (see MemberProfile's "All-time pts" card).
  const { start: challengeStart, end: challengeEnd } = resolveMonthBounds();

  const [dailyScoresRes, goalsRes, challengeRes, challengeAllTimeRes, challengeHistoryRes, tasksRes, badgesRes, volunteerRes, legacyFactsRes, timelineRes] = await Promise.all([
    query(
      `select date, total_score, best_self, ceo_mindset, grit, happiness, sleep, volunteer_hours,
              earned_way, challenges, goals_worked_on
         from daily_scores where user_id = $1 order by date desc limit 30`,
      [id]
    ),
    query(
      `select id, type, name, completed, completed_date, target_date, created_at, details
         from goals where user_id = $1 order by created_at desc`,
      [id]
    ),
    query(
      `select coalesce(sum(total_points), 0)::numeric as total_points, count(*)::int as days_logged
         from summer_entries where user_id = $1 and date between $2 and $3`,
      [id, challengeStart, challengeEnd]
    ),
    query(
      `select coalesce(sum(total_points), 0)::numeric as total_points, count(*)::int as days_logged
         from summer_entries where user_id = $1`,
      [id]
    ),
    query(
      `select date, total_points, submitted_at, sleep_bed_before_10, sleep_8h, hydration, exercise,
              screen_time_tier, mindfulness_sessions, reading_sessions, daily_update_sent, nutrition, cold_plunge_type
         from summer_entries where user_id = $1 order by date desc limit 30`,
      [id]
    ),
    query(
      `select ts.id, ts.status, ts.hours_spent, ts.notes, ts.completed_date, ts.created_at, it.title, it.level
         from task_signups ts
         join internship_tasks it on it.id = ts.task_id
        where ts.user_id = $1
        order by ts.created_at desc`,
      [id]
    ),
    query(
      `select b.id, b.badge_type, b.name, b.description, b.icon_emoji, b.earned_date,
              b.reason, b.source, b.awarded_by, b.trigger_key,
              u.first_name as awarded_by_first_name, u.last_name as awarded_by_last_name
         from badges b
         left join users u on u.id = b.awarded_by
        where b.user_id = $1
        order by b.earned_date desc`,
      [id]
    ),
    query(
      `select coalesce(sum(volunteer_hours), 0)::float as total,
              (select date::text from daily_scores where user_id = $1 and volunteer_hours > 0 order by date desc limit 1) as last_activity
         from daily_scores where user_id = $1`,
      [id]
    ),
    query(
      `select count(*)::int as fact_count, count(distinct legacy_goal_id)::int as group_count
         from legacy_goal_facts where user_id = $1`,
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
       union all
       (select 'challenge_entry', se.submitted_at, 'Logged Inspire Challenge (' || se.total_points || ' pts)'
          from summer_entries se where se.user_id = $1
         order by se.submitted_at desc limit 10)
       order by occurred_at desc
       limit 20`,
      [id]
    ),
  ]);

  // Books/logs for this user's own (non-orphan) goals — two queries total,
  // not one per goal, then attached in JS.
  const [booksRes, logsRes] = await Promise.all([
    query(`select * from goal_books where user_id = $1 order by order_index asc`, [id]),
    query(`select * from goal_logs where user_id = $1 order by date desc`, [id]),
  ]);
  const goals = goalsRes.rows.map((g) => ({
    ...g,
    books: booksRes.rows.filter((b) => b.goal_id === g.id),
    logs: logsRes.rows.filter((l) => l.goal_id === g.id),
  }));

  return {
    user,
    dailyScores: dailyScoresRes.rows,
    goals,
    challenge: challengeRes.rows[0],
    challengeAllTime: challengeAllTimeRes.rows[0],
    challengePeriod: { start: challengeStart, end: challengeEnd },
    challengeHistory: challengeHistoryRes.rows,
    tasks: tasksRes.rows,
    badges: badgesRes.rows,
    volunteerHours: { total: volunteerRes.rows[0].total, lastActivity: volunteerRes.rows[0].last_activity },
    // Historical Base44 legacy status is derived ONLY from live DB state —
    // never from re-reading the offline CSV export at runtime (that data is
    // never deployed anywhere; see MIGRATION_READINESS_REPORT.md). This is
    // intentionally a 2-state signal, not the full dry-run tool's
    // classification — a live "legacy history available for this email but
    // not yet imported" state would require deploying participant PII to
    // production, which this app deliberately never does.
    legacyStatus:
      legacyFactsRes.rows[0].fact_count > 0 || badgesRes.rows.some((b) => b.source === 'legacy')
        ? { state: 'imported', archivedFactGroups: legacyFactsRes.rows[0].group_count, archivedFactCount: legacyFactsRes.rows[0].fact_count }
        : { state: 'none', archivedFactGroups: 0, archivedFactCount: 0 },
    timeline: timelineRes.rows,
  };
}
