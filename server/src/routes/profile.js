import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db.js';
import { toClientUser, updateThemePreference } from '../repositories/users.js';
import { ptDateString } from '../config/pacificTime.js';

const VALID_THEME_PREFERENCES = ['light', 'dark', 'system'];

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const [badgesRes, goalsCompletedRes, tasksCompletedRes] = await Promise.all([
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
    isStaff: req.user.app_role === 'staff',
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
