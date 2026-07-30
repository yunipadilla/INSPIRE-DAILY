import { query } from '../../db.js';
import { ptDateString, isSundayPT } from '../../config/pacificTime.js';
import { SUMMER_CHALLENGE_LAUNCH_DATE } from '../../config/constants.js';

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
