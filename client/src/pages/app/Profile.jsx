import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import SectionHeader from '../../components/SectionHeader';

const BADGE_CATEGORIES = [
  { key: 'icf_events', label: 'ICF Events' },
  { key: 'staff_awards', label: 'Staff Awards' },
  { key: 'skills', label: 'Skills' },
  { key: 'milestones', label: 'Milestones' },
];

const STAT_STYLES = [
  { emoji: '🔥', accent: '#f59e0b', bg: '#fffbeb' },
  { emoji: '🏅', accent: '#818cf8', bg: '#eef2ff' },
  { emoji: '🎯', accent: '#c026d3', bg: '#fdf4ff' },
  { emoji: '📅', accent: '#059669', bg: '#ecfdf5' },
];

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

  const { user, stats, badges, hasHQAccess } = data;
  const statValues = [stats.streakCount, stats.badgesEarned, stats.goalsCompleted, stats.daysInProgram];
  const statLabels = ['Streak', 'Badges', 'Goals', 'Days'];
  const totalBadges = Object.values(badges).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="py-4 space-y-6">
      <div className="card p-6 gradient-rainbow relative overflow-hidden">
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
        <SectionHeader icon="🏅" iconBg="#eef2ff" title="Badge Wall" action={<span className="text-xs font-semibold text-navy/50">{totalBadges} earned</span>} />
        <div className="card p-4 space-y-4">
          {BADGE_CATEGORIES.map((cat) => (
            <div key={cat.key}>
              <h3 className="text-xs font-semibold text-navy/60 mb-2">
                {cat.label} {badges[cat.key].length > 0 && <span className="text-navy/30">({badges[cat.key].length})</span>}
              </h3>
              <div className="flex gap-2 flex-wrap">
                {(badges[cat.key].length ? badges[cat.key] : [null, null, null]).map((b, i) => (
                  <div
                    key={b?.id || i}
                    title={b ? `${b.name} — earned ${b.earned_date}` : 'Locked'}
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-lg ${
                      b ? 'gradient-rainbow shadow-sm' : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    {b ? b.icon_emoji || '🏅' : '🔒'}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader icon="✅" iconBg="#ecfdf5" title="Completed Achievements" />
        <div className="card p-4 grid grid-cols-2 divide-x divide-[#f5f5f5] text-center">
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

      <button onClick={handleLogout} className="pressable w-full rounded-lg py-2.5 font-semibold text-navy/70 border border-[#e5e5e5]">
        Log out
      </button>

      {hasHQAccess && (
        <section>
          <SectionHeader icon="🧑‍💼" iconBg="#e0e7ff" title="Staff Tools" />
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

function StatCard({ value, label, emoji, accent, bg }) {
  return (
    <div className="card p-3" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="text-base mb-0.5">{emoji}</div>
      <div className="text-lg font-extrabold text-navy">{value}</div>
      <div className="text-[10px] uppercase text-navy/50">{label}</div>
    </div>
  );
}
