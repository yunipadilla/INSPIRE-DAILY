import { query } from '../../db.js';
import { ptDateString, isSundayPT, addDays } from '../../config/pacificTime.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../../config/constants.js';
import { windowBounds, nonRestDayCount, scaffoldDays } from './metricsHelpers.js';

// Deterministic "needing attention" rule (Inspire 2.1 Part 06): no Daily
// Scores submission within this many days. Easy to find, easy to change —
// no AI/model involved, just a plain threshold.
const ATTENTION_NO_SUBMISSION_DAYS = 3;

/**
 * All Overview numbers are real aggregate queries against the same tables
 * Inspire Daily writes — never a second, HQ-only data model (Inspire 2.1
 * Part 04's shared-backend rule). Every count is scoped to
 * system_role='participant' so staff/admin accounts never inflate program
 * metrics about themselves.
 */
export async function getOverviewMetrics() {
  const today = ptDateString();
  const sunday = isSundayPT();
  const summerLaunched = today >= SUMMER_CHALLENGE_LAUNCH_DATE;

  const [
    participantsRes,
    dailyScoresTodayRes,
    activeGoalsRes,
    completedTasksRes,
    challengeTodayRes,
    needingAttentionRes,
    recentActivityRes,
  ] = await Promise.all([
    query(`select count(*)::int as count from users where system_role = 'participant' and account_status = 'approved'`),

    sunday
      ? Promise.resolve({ rows: [{ count: 0 }] })
      : query(
          `select count(*)::int as count
             from daily_scores ds
             join users u on u.id = ds.user_id
            where ds.date = $1 and u.system_role = 'participant' and u.account_status = 'approved'`,
          [today]
        ),

    query(
      `select count(*)::int as count
         from goals g
         join users u on u.id = g.user_id
        where g.completed = false and u.system_role = 'participant'`
    ),

    query(
      `select count(*)::int as count
         from task_signups ts
         join users u on u.id = ts.user_id
        where ts.status = 'completed' and u.system_role = 'participant'`
    ),

    summerLaunched && !sunday
      ? query(
          `select count(*)::int as count
             from summer_entries se
             join users u on u.id = se.user_id
            where se.date = $1 and u.system_role = 'participant'`,
          [today]
        )
      : Promise.resolve({ rows: [{ count: 0 }] }),

    query(
      `select u.id, u.first_name, u.last_name, u.streak_count,
              (select max(ds.date) from daily_scores ds where ds.user_id = u.id) as last_submission
         from users u
        where u.system_role = 'participant' and u.account_status = 'approved'
          and not exists (
            select 1 from daily_scores ds
             where ds.user_id = u.id and ds.date >= ($1::date - make_interval(days => $2))
          )
        order by last_submission asc nulls first
        limit 10`,
      [today, ATTENTION_NO_SUBMISSION_DAYS]
    ),

    query(
      `(select 'daily_score' as type, ds.submitted_at as occurred_at, u.id as user_id,
               u.first_name, u.last_name, 'Submitted Daily Scores' as description
          from daily_scores ds join users u on u.id = ds.user_id
         order by ds.submitted_at desc limit 15)
       union all
       (select 'goal_completed', g.updated_at, u.id, u.first_name, u.last_name,
               'Completed goal "' || g.name || '"'
          from goals g join users u on u.id = g.user_id
         where g.completed = true
         order by g.updated_at desc limit 15)
       union all
       (select 'task_completed', ts.completed_date::timestamptz, u.id, u.first_name, u.last_name,
               'Completed task "' || it.title || '"'
          from task_signups ts
          join users u on u.id = ts.user_id
          join internship_tasks it on it.id = ts.task_id
         where ts.status = 'completed' and ts.completed_date is not null
         order by ts.completed_date desc limit 15)
       union all
       (select 'badge_earned', b.earned_date::timestamptz, u.id, u.first_name, u.last_name,
               'Earned badge "' || b.name || '"'
          from badges b join users u on u.id = b.user_id
         order by b.earned_date desc limit 15)
       order by occurred_at desc
       limit 15`
    ),
  ]);

  const participantCount = participantsRes.rows[0].count;
  const dailyScoresToday = dailyScoresTodayRes.rows[0].count;

  return {
    isSunday: sunday,
    isChallengeLaunched: summerLaunched,
    participantCount,
    dailyScores: {
      submittedToday: dailyScoresToday,
      eligibleToday: sunday ? 0 : participantCount,
      completionRate: !sunday && participantCount > 0 ? dailyScoresToday / participantCount : null,
    },
    activeGoalsCount: activeGoalsRes.rows[0].count,
    completedTasksCount: completedTasksRes.rows[0].count,
    challengeParticipationToday: challengeTodayRes.rows[0].count,
    needingAttention: needingAttentionRes.rows,
    recentActivity: recentActivityRes.rows,
  };
}

/**
 * Program Performance — a rollup used by both the Overview page's "C.
 * Program Performance" section and Analytics. 7-day/30-day participation are
 * computed against a non-rest-day denominator (Sunday never counts), same
 * rule as the participant-facing streak engine.
 */
export async function getProgramPerformance() {
  const today = ptDateString();
  const denom7 = nonRestDayCount(addDays(today, -6), today);
  const denom30 = nonRestDayCount(addDays(today, -29), today);

  const [participantsRes, submissions7Res, submissions30Res, streakRes, goalsRes, tasksRes, volunteerRes, challengeRes, badgesRes] =
    await Promise.all([
      query(`select count(*)::int as count from users where system_role = 'participant' and account_status = 'approved'`),
      query(
        `select count(*)::int as count from daily_scores ds join users u on u.id = ds.user_id
          where ds.date >= $1 and u.system_role = 'participant' and u.account_status = 'approved'`,
        [addDays(today, -6)]
      ),
      query(
        `select count(*)::int as count from daily_scores ds join users u on u.id = ds.user_id
          where ds.date >= $1 and u.system_role = 'participant' and u.account_status = 'approved'`,
        [addDays(today, -29)]
      ),
      query(
        `select coalesce(avg(streak_count) filter (where streak_count > 0), 0)::float as avg_streak
           from users where system_role = 'participant' and account_status = 'approved'`
      ),
      query(
        `select count(*) filter (where completed = true)::int as completed, count(*)::int as total
           from goals g join users u on u.id = g.user_id where u.system_role = 'participant'`
      ),
      query(
        `select count(*) filter (where status = 'completed')::int as completed, count(*)::int as total
           from task_signups ts join users u on u.id = ts.user_id where u.system_role = 'participant'`
      ),
      query(
        `select coalesce(sum(volunteer_hours), 0)::float as total from daily_scores ds join users u on u.id = ds.user_id
          where u.system_role = 'participant'`
      ),
      query(
        `select count(distinct se.user_id)::int as participants from summer_entries se join users u on u.id = se.user_id
          where u.system_role = 'participant'`
      ),
      query(
        `select count(*)::int as count from badges b join users u on u.id = b.user_id where u.system_role = 'participant'`
      ),
    ]);

  const participantCount = participantsRes.rows[0].count;
  const maxSubmissions7 = participantCount * denom7;
  const maxSubmissions30 = participantCount * denom30;

  return {
    participation7d: maxSubmissions7 > 0 ? submissions7Res.rows[0].count / maxSubmissions7 : null,
    participation30d: maxSubmissions30 > 0 ? submissions30Res.rows[0].count / maxSubmissions30 : null,
    averageActiveStreak: streakRes.rows[0].avg_streak,
    goalCompletionRate: goalsRes.rows[0].total > 0 ? goalsRes.rows[0].completed / goalsRes.rows[0].total : null,
    taskCompletionRate: tasksRes.rows[0].total > 0 ? tasksRes.rows[0].completed / tasksRes.rows[0].total : null,
    totalVolunteerHours: volunteerRes.rows[0].total,
    challengeParticipants: challengeRes.rows[0].participants,
    badgesAwarded: badgesRes.rows[0].count,
  };
}

/**
 * Trend series for the Overview/Analytics charts — one grouped query per
 * metric (never per-day queries), scaffolded onto every day in the window
 * so gaps render as zero, not a missing point.
 */
export async function getProgramTrends({ days = 30 } = {}) {
  const today = ptDateString();
  const { start } = windowBounds(days, today);

  const [scoresRes, goalsRes, tasksRes, challengeRes, volunteerRes] = await Promise.all([
    query(
      `select ds.date::text as day, count(*)::int as count from daily_scores ds join users u on u.id = ds.user_id
        where ds.date between $1 and $2 and u.system_role = 'participant' group by ds.date`,
      [start, today]
    ),
    query(
      `select g.completed_date::text as day, count(*)::int as count from goals g join users u on u.id = g.user_id
        where g.completed = true and g.completed_date between $1 and $2 and u.system_role = 'participant' group by g.completed_date`,
      [start, today]
    ),
    query(
      `select ts.completed_date::text as day, count(*)::int as count from task_signups ts join users u on u.id = ts.user_id
        where ts.status = 'completed' and ts.completed_date between $1 and $2 and u.system_role = 'participant' group by ts.completed_date`,
      [start, today]
    ),
    query(
      `select se.date::text as day, count(*)::int as count from summer_entries se join users u on u.id = se.user_id
        where se.date between $1 and $2 and u.system_role = 'participant' group by se.date`,
      [start, today]
    ),
    query(
      `select ds.date::text as day, coalesce(sum(ds.volunteer_hours), 0)::float as count from daily_scores ds join users u on u.id = ds.user_id
        where ds.date between $1 and $2 and u.system_role = 'participant' group by ds.date`,
      [start, today]
    ),
  ]);

  const days_ = scaffoldDays(start, today);
  const toSeries = (rows) => {
    const byDay = new Map(rows.map((r) => [r.day, r.count]));
    return days_.map((day) => ({ date: day, value: byDay.get(day) || 0 }));
  };

  return {
    dailyScoreSubmissions: toSeries(scoresRes.rows),
    goalCompletions: toSeries(goalsRes.rows),
    taskCompletions: toSeries(tasksRes.rows),
    challengeParticipation: toSeries(challengeRes.rows),
    volunteerHours: toSeries(volunteerRes.rows),
  };
}
