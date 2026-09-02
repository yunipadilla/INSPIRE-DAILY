import { query } from '../../db.js';
import { getProgramPerformance, getProgramTrends } from './overviewService.js';
import { getDailyScoresOverview } from './dailyScoresService.js';
import { getGoalsOverview } from './goalsService.js';
import { getChallengeOverview } from './challengeService.js';
import { getTasksOverview } from './tasksService.js';
import { getVolunteerHoursOverview } from './volunteerHoursService.js';

/**
 * Analytics is a composition layer, not a new data model — every number
 * here comes from the same per-section services the dedicated HQ pages use,
 * so there is exactly one source of truth per metric. No predictive/AI
 * scoring, per the approved scope.
 */
export async function getAnalytics({ days = 30 } = {}) {
  const [performance, trends, dailyScores, goals, challenge, tasks, volunteerHours] = await Promise.all([
    getProgramPerformance(),
    getProgramTrends({ days }),
    getDailyScoresOverview({ days }),
    getGoalsOverview({ days }),
    getChallengeOverview({ days }),
    getTasksOverview({ days }),
    getVolunteerHoursOverview({ days }),
  ]);

  return {
    windowDays: days,
    performance,
    trends,
    dailyScores: { participationRateToday: dailyScores.participationRateToday, averageStreak: dailyScores.averageStreak, windowAverages: dailyScores.windowAverages },
    goals: { activeGoals: goals.activeGoals, completedGoals: goals.completedGoals, completionRate: goals.completionRate, byType: goals.byType },
    challenge: { participants: challenge.participants, totalPoints: challenge.totalPoints, avgPointsPerEntry: challenge.avgPointsPerEntry, categoryParticipation: challenge.categoryParticipation },
    tasks: { total: tasks.total, in_progress: tasks.in_progress, completed: tasks.completed, total_hours: tasks.total_hours },
    volunteerHours: { totalHours: volunteerHours.totalHours, hoursThisMonth: volunteerHours.hoursThisMonth },
  };
}

/** Role comparison (intern/postgrad/alumni) for the requested window — a
 * single grouped query per metric, not per-role queries. */
export async function getRoleComparison() {
  const [scoresRes, goalsRes, tasksRes] = await Promise.all([
    query(
      `select u.app_role, count(distinct ds.user_id)::int as active_participants, count(*)::int as submissions
         from daily_scores ds join users u on u.id = ds.user_id
        where u.system_role = 'participant'
        group by u.app_role`
    ),
    query(
      `select u.app_role, count(*) filter (where g.completed) ::int as completed, count(*)::int as total
         from goals g join users u on u.id = g.user_id
        where u.system_role = 'participant'
        group by u.app_role`
    ),
    query(
      `select u.app_role, count(*) filter (where ts.status = 'completed')::int as completed, count(*)::int as total
         from task_signups ts join users u on u.id = ts.user_id
        where u.system_role = 'participant'
        group by u.app_role`
    ),
  ]);

  const byRole = {};
  const ensure = (role) => (byRole[role] ||= { appRole: role, submissions: 0, activeParticipants: 0, goalsCompleted: 0, goalsTotal: 0, tasksCompleted: 0, tasksTotal: 0 });
  for (const r of scoresRes.rows) Object.assign(ensure(r.app_role), { submissions: r.submissions, activeParticipants: r.active_participants });
  for (const r of goalsRes.rows) Object.assign(ensure(r.app_role), { goalsCompleted: r.completed, goalsTotal: r.total });
  for (const r of tasksRes.rows) Object.assign(ensure(r.app_role), { tasksCompleted: r.completed, tasksTotal: r.total });
  return Object.values(byRole);
}
