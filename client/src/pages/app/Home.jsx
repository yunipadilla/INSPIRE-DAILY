import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { greetingFor } from '../../lib/pacificTime';
import { useAuth } from '../../context/AuthContext';
import SectionHeader from '../../components/SectionHeader';
import BubbleBackground from '../../components/BubbleBackground';

const ACTION_CARDS = [
  { key: 'dailyScores', label: 'Daily Scores', to: '/app/daily-scores', gradient: 'gradient-daily-scores', emoji: '📊', accent: 'rgb(var(--color-blue))', bg: 'rgb(var(--color-blue) / 0.14)' },
  { key: 'inspireChallenge', label: 'Inspire Challenge', to: '/app/inspire-challenge', gradient: 'gradient-inspire-challenge', emoji: '🏆', accent: 'rgb(var(--color-warning))', bg: 'rgb(var(--color-yellow) / 0.35)' },
  { key: 'goals', label: 'Goals', to: '/app/goals', gradient: 'gradient-goals', emoji: '🎯', accent: 'rgb(var(--color-lavender))', bg: 'rgb(var(--color-lavender) / 0.22)' },
  {
    key: 'internshipTasks',
    label: 'Internship Tasks',
    to: '/app/tasks',
    gradient: 'gradient-internship-tasks',
    emoji: '📋',
    accent: 'rgb(var(--color-success))',
    bg: 'rgb(var(--color-success) / 0.14)',
    hideForRoles: ['alumni'],
  },
];

const CELEBRATION_ICON = { streak_milestone: '🔥', shield_earned: '🛡️', goal_completed: '🎯' };
const MEDAL = ['🥇', '🥈', '🥉'];

function ActionStatusPill({ status }) {
  if (status === 'done') return <span className="text-xs font-bold text-success">✓ Done</span>;
  if (status === 'rest_day') return <span className="text-xs font-bold text-navy/50">Rest day</span>;
  if (status === 'coming_soon' || status === 'hidden')
    return <span className="text-xs font-bold text-ink-muted">Coming soon</span>;
  return <span className="text-xs font-bold text-navy">Start →</span>;
}

const FOCUS_COPY = {
  dailyScores: { title: "Log today's Daily Scores", sub: 'Takes about a minute.' },
  inspireChallenge: { title: "Log today's Inspire Challenge entry", sub: 'Keep the streak going.' },
  goals: { title: 'Check in on your goals', sub: "See what's next." },
  internshipTasks: { title: 'Pick up an internship task', sub: "There's work waiting for you." },
};

function pickFocus(actions, todaysActions) {
  return actions.find((a) => (todaysActions?.[a.key] || 'start') === 'start') || null;
}

export default function Home() {
  const { user } = useAuth();
  const location = useLocation();
  const [summary, setSummary] = useState(null);
  const [feed, setFeed] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);
  const [showWelcome, setShowWelcome] = useState(Boolean(location.state?.justSignedUp));

  useEffect(() => {
    apiFetch('/home/summary').then(setSummary);
    apiFetch('/home/celebration-feed').then((d) => setFeed(d.items));
    apiFetch('/home/leaderboard-preview').then(setLeaderboard);
  }, []);

  const actions = ACTION_CARDS.filter((a) => !a.hideForRoles?.includes(user?.appRole));
  const focus = pickFocus(actions, summary?.todaysActions);
  const rest = actions.filter((a) => a.key !== focus?.key);

  return (
    <div className="space-y-7">
      {showWelcome && (
        <div className="card p-4 flex items-center justify-between gap-3 gradient-rainbow text-white shadow-md rise-in">
          <p className="text-sm font-semibold">
            Welcome, {location.state?.firstName || user?.firstName}! So glad you're here. 🎉
          </p>
          <button
            onClick={() => setShowWelcome(false)}
            aria-label="Dismiss welcome message"
            className="pressable text-white/90 text-lg leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>
      )}

      <div className="relative -mx-4 px-4 pt-4 pb-6 overflow-hidden">
        <BubbleBackground variant="light" />

        <h1 className="bubble-heading text-2xl sm:text-3xl relative z-10 rise-in">
          {greetingFor(user?.firstName || '')}
        </h1>

        {summary && (
          <div className="rise-in stagger-1 relative z-10 mt-5 gradient-rainbow rounded-2xl p-5 grid grid-cols-4 gap-2 text-white text-center shadow-md">
            <Stat value={summary.stats.streakCount} label="Streak" />
            <Stat value={summary.stats.badgesCount} label="Badges" />
            <Stat value={summary.stats.activeGoalsCount} label="Goals" />
            <Stat value={`${summary.stats.streakShields}/${summary.stats.maxShields}`} label="Shields" />
          </div>
        )}
      </div>

      <section>
        <SectionHeader icon="⚡" iconBg="#fef3c7" title="Today's Focus" />
        {focus ? (
          <Link
            to={focus.to}
            className="pressable card card-lift p-5 flex items-center gap-4 relative overflow-hidden rise-in"
            style={{ borderLeft: `4px solid ${focus.accent}` }}
          >
            <span className="icon-badge flex-shrink-0" style={{ background: focus.bg, width: 48, height: 48, fontSize: '1.5rem' }}>
              {focus.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-navy leading-tight">
                {FOCUS_COPY[focus.key]?.title || focus.label}
              </p>
              <p className="text-sm text-navy/50 mt-0.5">{FOCUS_COPY[focus.key]?.sub}</p>
            </div>
            <span className="text-navy font-bold text-lg flex-shrink-0">→</span>
          </Link>
        ) : (
          <div className="card p-5 flex items-center gap-4 gradient-rainbow text-white rise-in">
            <span className="text-2xl">🎉</span>
            <p className="text-sm font-semibold">You're all caught up for today. Nice work!</p>
          </div>
        )}

        {rest.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {rest.map((a) => (
              <Link
                key={a.key}
                to={a.to}
                className="pressable card p-3 flex flex-col items-center gap-1.5 text-center"
              >
                <span className="icon-badge" style={{ background: a.bg, width: 32, height: 32, fontSize: '1rem' }}>
                  {a.emoji}
                </span>
                <span className="text-[11px] font-semibold text-navy leading-tight">{a.label}</span>
                <ActionStatusPill status={summary?.todaysActions?.[a.key] || 'start'} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {summary?.weeklyProgress && summary.weeklyProgress.eligibleDays > 0 && (
        <section>
          <SectionHeader icon="📈" iconBg="rgb(var(--color-mint) / 0.3)" title="This Week" />
          <div className="card p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-navy">
                {summary.weeklyProgress.submitted} of {summary.weeklyProgress.eligibleDays} days logged
              </span>
              <span className="text-navy/50">
                {Math.round((summary.weeklyProgress.submitted / summary.weeklyProgress.eligibleDays) * 100)}%
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill gradient-daily-scores"
                style={{
                  width: `${Math.min(100, (summary.weeklyProgress.submitted / summary.weeklyProgress.eligibleDays) * 100)}%`,
                }}
              />
            </div>
          </div>
        </section>
      )}

      <section className="opacity-90">
        <SectionHeader icon="🎉" iconBg="rgb(var(--color-lavender) / 0.3)" title="Celebration Feed" />
        <div className="card divide-y divide-border/6 overflow-hidden">
          {feed.length === 0 && (
            <p className="p-4 text-sm text-navy/50">No celebrations yet — check back soon!</p>
          )}
          {feed.map((item) => (
            <div key={item.id} className="p-3 flex items-center gap-3 text-sm text-navy">
              <span className="text-lg">{CELEBRATION_ICON[item.type] || '🎉'}</span>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="opacity-90">
        <SectionHeader icon="🏆" iconBg="rgb(var(--color-primary) / 0.16)" title="Leaderboard" />
        {leaderboard?.guestNote && <p className="text-xs text-navy/50 mb-2">{leaderboard.guestNote}</p>}
        <div className="card divide-y divide-border/6 overflow-hidden">
          {leaderboard?.entries.map((e, i) => (
            <div
              key={e.id}
              className={`flex items-center gap-3 p-3 ${e.isCurrentUser ? 'bg-primary/10' : ''}`}
            >
              <span className="w-6 text-base text-center">{MEDAL[i] || <span className="text-sm font-bold text-navy/40">{e.rank}</span>}</span>
              <div className="w-9 h-9 rounded-full gradient-rainbow flex items-center justify-center text-xs font-bold text-white overflow-hidden flex-shrink-0">
                {e.profilePhotoUrl ? (
                  <img src={e.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  `${e.firstName?.[0] || ''}${e.lastInitial}`
                )}
              </div>
              <span className="flex-1 text-sm font-medium text-navy">
                {e.firstName} {e.lastInitial}.
              </span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-soft text-navy/60">
                {e.appRole}
              </span>
              <span className="text-sm font-extrabold text-navy">{e.score}</span>
            </div>
          ))}
          {leaderboard && leaderboard.entries.length === 0 && (
            <p className="p-4 text-sm text-navy/50">No scores yet this month.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="text-2xl font-extrabold drop-shadow-sm">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-90 font-semibold">{label}</div>
    </div>
  );
}
