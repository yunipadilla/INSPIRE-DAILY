import { Router } from 'express';
import { getOverviewMetrics, getProgramPerformance, getProgramTrends } from '../../services/hq/overviewService.js';

const router = Router();

router.get('/', async (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const [data, performance, trends] = await Promise.all([
    getOverviewMetrics(),
    getProgramPerformance(),
    getProgramTrends({ days }),
  ]);

  res.json({
    isSunday: data.isSunday,
    isChallengeLaunched: data.isChallengeLaunched,
    stats: {
      participants: data.participantCount,
      dailyScoresSubmittedToday: data.dailyScores.submittedToday,
      dailyScoresEligibleToday: data.dailyScores.eligibleToday,
      dailyScoresCompletionRate: data.dailyScores.completionRate,
      activeGoals: data.activeGoalsCount,
      completedTasks: data.completedTasksCount,
      challengeParticipationToday: data.challengeParticipationToday,
    },
    needingAttention: data.needingAttention.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      streakCount: r.streak_count,
      lastSubmission: r.last_submission,
    })),
    recentActivity: data.recentActivity.map((r) => ({
      type: r.type,
      occurredAt: r.occurred_at,
      userId: r.user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      description: r.description,
    })),
    performance,
    trends: { windowDays: days, ...trends },
  });
});

export default router;
