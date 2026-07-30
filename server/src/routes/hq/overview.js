import { Router } from 'express';
import { getOverviewMetrics } from '../../services/hq/overviewService.js';

const router = Router();

router.get('/', async (req, res) => {
  const data = await getOverviewMetrics();

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
  });
});

export default router;
