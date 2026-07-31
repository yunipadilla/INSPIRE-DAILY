import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import SectionHeader from '../../components/SectionHeader';
import Medal from '../../components/ui/Medal';
import { formatDateLabel } from '../../lib/pacificTime';

const BADGE_CATEGORIES = [
  { key: 'icf_events', label: 'ICF Events' },
  { key: 'staff_awards', label: 'Staff Awards' },
  { key: 'skills', label: 'Skills' },
  { key: 'milestones', label: 'Milestones' },
];

const STAT_STYLES = [
  { emoji: '🔥', accent: 'rgb(var(--color-warning))' },
  { emoji: '🏅', accent: 'rgb(var(--color-primary))' },
  { emoji: '🎯', accent: 'rgb(var(--color-lavender))' },
  { emoji: '📅', accent: 'rgb(var(--color-success))' },
];

const TIMELINE_ICON = {
  daily_score: '📊',
  goal_completed: '🎯',
  task_completed: '🏆',
  badge_earned: '🏅',
};

export default function Profile() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch('/profile').then(setData);
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  if (!data) return <div className="py-10 text-center text-navy/50">Loading…</div>;

  const { user, stats, badges, timeline, calendar, hasHQAccess } = data;
  const statValues = [stats.streakCount, stats.badgesEarned, stats.goalsCompleted, stats.daysInProgram];
  const statLabels = ['Streak', 'Badges', 'Goals', 'Days'];
  const totalBadges = Object.values(badges).reduce((sum, arr) => sum + arr.length, 0);
  const calendarSet = new Set(calendar);
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="py-4 space-y-6">
      <div className="gradient-hero gradient-rainbow p-6">
        <div className="relative z-10 flex flex-col items-center text-center gap-2">
          <div className="w-24 h-24 rounded-full bg-white/20 ring-4 ring-white/40 flex items-center justify-center text-3xl font-bold text-white overflow-hidden shadow-md">
            {user.profilePhotoUrl ? (
              <img src={user.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              `${user.firstName[0]}${user.lastName[0]}`
            )}
          </div>
          <h1 className="text-xl font-bold text-white drop-shadow-sm">{user.fullName}</h1>
          <span className="text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-white/25 text-white">
            {user.appRole}
          </span>
          <p className="text-xs text-white/80">{stats.daysInProgram} days in the program</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {statValues.map((value, i) => (
          <StatCard key={statLabels[i]} value={value} label={statLabels[i]} {...STAT_STYLES[i]} />
        ))}
      </div>

      <section>
        <SectionHeader
          icon="🏅"
          iconBg="rgb(var(--color-primary) / 0.16)"
          title="Badge Wall"
          action={<span className="text-xs font-semibold text-navy/50">{totalBadges} earned</span>}
        />
        <div className="card p-4 space-y-4">
          {BADGE_CATEGORIES.map((cat) => (
            <div key={cat.key}>
              <h3 className="text-xs font-semibold text-navy/60 mb-2">
                {cat.label} {badges[cat.key].length > 0 && <span className="text-navy/30">({badges[cat.key].length})</span>}
              </h3>
              <div className="flex gap-3 flex-wrap">
                {(badges[cat.key].length ? badges[cat.key] : [null, null, null]).map((b, i) => (
                  <Medal
                    key={b?.id || i}
                    icon={b?.icon_emoji || '🏅'}
                    category={cat.key}
                    locked={!b}
                    title={b ? `${b.name} — earned ${b.earned_date}` : 'Locked'}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader icon="✅" iconBg="rgb(var(--color-success) / 0.16)" title="Completed Achievements" />
        <div className="card p-4 grid grid-cols-2 divide-x divide-border/8 text-center">
          <div>
            <div className="text-2xl font-extrabold text-navy">{stats.goalsCompleted}</div>
            <div className="text-[10px] uppercase text-navy/50 font-semibold">Goals completed</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-navy">{stats.tasksCompleted}</div>
            <div className="text-[10px] uppercase text-navy/50 font-semibold">Tasks completed</div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader icon="📅" iconBg="rgb(var(--color-mint) / 0.25)" title="Last 30 Days" />
        <div className="card p-4">
          <div className="grid grid-cols-10 gap-1.5">
            {last30Days.map((d) => (
              <div
                key={d}
                title={d}
                className={`aspect-square rounded-md ${calendarSet.has(d) ? 'bg-mint' : 'bg-surface-soft'}`}
              />
            ))}
          </div>
          <p className="text-[10px] text-navy/40 mt-2 uppercase tracking-wide">Daily Scores submitted</p>
        </div>
      </section>

      {timeline.length > 0 && (
        <section>
          <SectionHeader icon="🕓" iconBg="rgb(var(--color-lavender) / 0.25)" title="Achievement Timeline" />
          <div className="card divide-y divide-border/6 overflow-hidden">
            {timeline.slice(0, 10).map((item, i) => (
              <div key={i} className="p-3 flex items-center gap-3 text-sm text-navy">
                <span className="text-lg">{TIMELINE_ICON[item.type] || '✨'}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{item.description}</p>
                </div>
                <span className="text-xs text-navy/40 whitespace-nowrap">
                  {formatDateLabel(item.occurredAt.slice(0, 10))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <button onClick={handleLogout} className="pressable w-full rounded-lg py-2.5 font-semibold text-navy/70 border border-border/16">
        Log out
      </button>

      {hasHQAccess && (
        <section>
          <SectionHeader icon="🧑‍💼" iconBg="rgb(var(--color-primary) / 0.16)" title="Staff Tools" />
          <Link
            to="/hq"
            className="pressable card card-lift p-4 flex items-center justify-between gradient-rainbow text-white font-semibold shadow-md"
          >
            Open Inspire HQ
            <span>→</span>
          </Link>
        </section>
      )}
    </div>
  );
}

function StatCard({ value, label, emoji, accent }) {
  return (
    <div className="card p-3" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="text-base mb-0.5">{emoji}</div>
      <div className="text-lg font-extrabold text-navy">{value}</div>
      <div className="text-[10px] uppercase text-navy/50">{label}</div>
    </div>
  );
}
