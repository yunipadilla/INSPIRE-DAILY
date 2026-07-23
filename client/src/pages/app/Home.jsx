import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { greetingFor } from '../../lib/pacificTime';
import { useAuth } from '../../context/AuthContext';
import SectionHeader from '../../components/SectionHeader';
import BubbleBackground from '../../components/BubbleBackground';

const ACTION_CARDS = [
  { key: 'dailyScores', label: 'Daily Scores', to: '/app/daily-scores', gradient: 'gradient-daily-scores', emoji: '📊', accent: '#3b82f6', bg: '#eff6ff' },
  { key: 'summerChallenge', label: 'Summer Challenge', to: '/app/summer-challenge', gradient: 'gradient-summer-challenge', emoji: '☀️', accent: '#d97706', bg: '#fffbeb' },
  { key: 'goals', label: 'Goals', to: '/app/goals', gradient: 'gradient-goals', emoji: '🎯', accent: '#c026d3', bg: '#fdf4ff' },
  {
    key: 'internshipTasks',
    label: 'Internship Tasks',
    to: '/app/tasks',
    gradient: 'gradient-internship-tasks',
    emoji: '📋',
    accent: '#059669',
    bg: '#ecfdf5',
    hideForRoles: ['alumni'],
  },
];

const CELEBRATION_ICON = { streak_milestone: '🔥', shield_earned: '🛡️', goal_completed: '🎯' };
const MEDAL = ['🥇', '🥈', '🥉'];

function ActionStatusPill({ status }) {
  if (status === 'done') return <span className="text-xs font-bold text-emerald-600">✓ Done</span>;
  if (status === 'rest_day') return <span className="text-xs font-bold text-navy/50">Rest day</span>;
  if (status === 'coming_soon' || status === 'hidden')
    return <span className="text-xs font-bold text-gray-400">Coming soon</span>;
  return <span className="text-xs font-bold text-navy">Start →</span>;
}

export default function Home() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [feed, setFeed] = useState([]);
  const [leaderboard, setLeaderboard] = useState(null);

  useEffect(() => {
    apiFetch('/home/summary').then(setSummary);
    apiFetch('/home/celebration-feed').then((d) => setFeed(d.items));
    apiFetch('/home/leaderboard-preview').then(setLeaderboard);
  }, []);

  const actions = ACTION_CARDS.filter((a) => !a.hideForRoles?.includes(user?.appRole));

  return (
    <div className="space-y-7">
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
        <SectionHeader icon="⚡" iconBg="#fef3c7" title="Today's Actions" />
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => (
            <Link
              key={a.key}
              to={a.to}
              className="pressable card card-lift p-4 flex flex-col justify-between h-28 overflow-hidden relative"
              style={{ borderLeft: `4px solid ${a.accent}` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="icon-badge"
                  style={{ background: a.bg }}
                >
                  {a.emoji}
                </span>
                <span className="text-sm font-semibold text-navy leading-tight">{a.label}</span>
              </div>
              <ActionStatusPill status={summary?.todaysActions?.[a.key] || 'start'} />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader icon="🎉" iconBg="#fce7f3" title="Celebration Feed" />
        <div className="card divide-y divide-[#f5f5f5] overflow-hidden">
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

      <section>
        <SectionHeader icon="🏆" iconBg="#e0e7ff" title="Leaderboard" />
        {leaderboard?.guestNote && <p className="text-xs text-navy/50 mb-2">{leaderboard.guestNote}</p>}
        <div className="card divide-y divide-[#f5f5f5] overflow-hidden">
          {leaderboard?.entries.map((e, i) => (
            <div
              key={e.id}
              className={`flex items-center gap-3 p-3 ${e.isCurrentUser ? 'bg-[#818cf8]/10' : ''}`}
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
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-navy/60">
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
