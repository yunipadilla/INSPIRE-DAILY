import { Router } from 'express';
import { listMembers, getMemberProfile } from '../../services/hq/memberService.js';
import { ALL_APP_ROLES } from '../../repositories/users.js';

const router = Router();

const VALID_ACCOUNT_STATUSES = ['pending', 'approved', 'denied'];
const VALID_SORTS = ['name', 'email', 'streak', 'createdAt', 'lastActivity'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toClientMember(m) {
  return {
    id: m.id,
    firstName: m.first_name,
    lastName: m.last_name,
    fullName: `${m.first_name} ${m.last_name}`,
    email: m.email,
    profilePhotoUrl: m.profile_photo_url,
    appRole: m.app_role,
    accountStatus: m.account_status,
    streakCount: m.streak_count,
    streakShields: m.streak_shields,
    createdAt: m.created_at,
    lastActivity: m.last_activity,
  };
}

router.get('/', async (req, res) => {
  const { search, appRole, accountStatus, sort, direction, page, pageSize } = req.query;

  if (appRole && !ALL_APP_ROLES.includes(appRole)) {
    return res.status(400).json({ error: 'Invalid appRole filter.' });
  }
  if (accountStatus && !VALID_ACCOUNT_STATUSES.includes(accountStatus)) {
    return res.status(400).json({ error: 'Invalid accountStatus filter.' });
  }
  if (sort && !VALID_SORTS.includes(sort)) {
    return res.status(400).json({ error: 'Invalid sort field.' });
  }

  const result = await listMembers({
    search: typeof search === 'string' ? search.trim().slice(0, 100) : undefined,
    appRole: typeof appRole === 'string' ? appRole : undefined,
    accountStatus: typeof accountStatus === 'string' ? accountStatus : undefined,
    sort,
    direction,
    page,
    pageSize,
  });

  res.json({
    members: result.members.map(toClientMember),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

router.get('/:id', async (req, res) => {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid member id.' });
  }

  const profile = await getMemberProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Member not found.' });

  res.json({
    user: {
      id: profile.user.id,
      firstName: profile.user.first_name,
      lastName: profile.user.last_name,
      fullName: `${profile.user.first_name} ${profile.user.last_name}`,
      email: profile.user.email,
      phone: profile.user.phone,
      profilePhotoUrl: profile.user.profile_photo_url,
      appRole: profile.user.app_role,
      accountStatus: profile.user.account_status,
      streakCount: profile.user.streak_count,
      streakShields: profile.user.streak_shields,
      streakLastDate: profile.user.streak_last_date,
      createdAt: profile.user.created_at,
      approvedAt: profile.user.approved_at,
    },
    dailyScores: profile.dailyScores.map((d) => ({
      date: d.date,
      totalScore: d.total_score,
      bestSelf: d.best_self,
      ceoMindset: d.ceo_mindset,
      grit: d.grit,
      happiness: d.happiness,
      sleep: d.sleep,
      volunteerHours: d.volunteer_hours,
    })),
    goals: profile.goals.map((g) => ({
      id: g.id,
      type: g.type,
      name: g.name,
      completed: g.completed,
      completedDate: g.completed_date,
      targetDate: g.target_date,
      createdAt: g.created_at,
    })),
    challenge: profile.challenge
      ? { totalPoints: Number(profile.challenge.total_points), daysLogged: profile.challenge.days_logged }
      : { totalPoints: 0, daysLogged: 0 },
    tasks: profile.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      level: t.level,
      status: t.status,
      hoursSpent: t.hours_spent,
      completedDate: t.completed_date,
      createdAt: t.created_at,
    })),
    badges: profile.badges.map((b) => ({
      id: b.id,
      badgeType: b.badge_type,
      name: b.name,
      description: b.description,
      iconEmoji: b.icon_emoji,
      earnedDate: b.earned_date,
    })),
    timeline: profile.timeline.map((t) => ({
      type: t.type,
      occurredAt: t.occurred_at,
      description: t.description,
    })),
  });
});

export default router;
