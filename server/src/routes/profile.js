import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db.js';
import { toClientUser, updateThemePreference } from '../repositories/users.js';
import { ptDateString, addDays } from '../config/pacificTime.js';
import { listDatesForUser } from '../repositories/dailyScores.js';

const VALID_THEME_PREFERENCES = ['light', 'dark', 'system'];

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const calendarStart = addDays(ptDateString(), -29);

  const [badgesRes, goalsCompletedRes, tasksCompletedRes, timelineRes, calendarDates] = await Promise.all([
    query(
      `select id, badge_type, name, description, icon_emoji, earned_date, trigger_key
       from badges where user_id = $1 order by earned_date desc`,
      [req.user.id]
    ),
    query('select count(*)::int as count from goals where user_id = $1 and completed = true', [
      req.user.id,
    ]),
    query(
      "select count(*)::int as count from task_signups where user_id = $1 and status = 'completed'",
      [req.user.id]
    ),
    // Achievement timeline — same merged-events pattern as HQ's member timeline
    // (services/hq/memberService.js), scoped to the signed-in user.
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
      [req.user.id]
    ),
    listDatesForUser(req.user.id, 30).then((dates) => dates.filter((d) => d >= calendarStart)),
  ]);

  const daysInProgram = Math.max(
    0,
    Math.floor((new Date(ptDateString()).getTime() - new Date(req.user.created_at).getTime()) / 86400000)
  );

  res.json({
    user: toClientUser(req.user),
    stats: {
      streakCount: req.user.streak_count,
      badgesEarned: badgesRes.rows.length,
      goalsCompleted: goalsCompletedRes.rows[0].count,
      tasksCompleted: tasksCompletedRes.rows[0].count,
      daysInProgram,
    },
    badges: {
      icf_events: badgesRes.rows.filter((b) => b.badge_type === 'event'),
      staff_awards: badgesRes.rows.filter((b) => b.badge_type === 'staff'),
      skills: badgesRes.rows.filter((b) => b.badge_type === 'skills'),
      milestones: badgesRes.rows.filter((b) => b.badge_type === 'milestone'),
    },
    timeline: timelineRes.rows.map((r) => ({
      type: r.type,
      occurredAt: r.occurred_at,
      description: r.description,
    })),
    calendar: calendarDates,
    hasHQAccess: ['staff', 'admin', 'super_admin'].includes(req.user.system_role),
  });
});

/**
 * Cross-device theme sync — best-effort from the client's point of view
 * (see ThemeAccountSync.jsx), but this endpoint itself is a plain,
 * fully-authenticated write scoped to exactly one column on the caller's
 * own row. No other field can be changed here.
 */
router.patch('/theme', requireAuth, async (req, res) => {
  const { themePreference } = req.body || {};
  if (!VALID_THEME_PREFERENCES.includes(themePreference)) {
    return res.status(400).json({ error: 'themePreference must be one of light, dark, or system.' });
  }
  const user = await updateThemePreference(req.user.id, themePreference);
  res.json({ user: toClientUser(user) });
});

export default router;
