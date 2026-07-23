import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import SectionHeader from '../../components/SectionHeader';

const BADGE_CATEGORIES = [
  { key: 'icf_events', label: 'ICF Events' },
  { key: 'staff_awards', label: 'Staff Awards' },
  { key: 'skills', label: 'Skills' },
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

  const { user, stats, badges, isStaff } = data;
  const statValues = [stats.streakCount, stats.badgesEarned, stats.goalsCompleted, stats.daysInProgram];
  const statLabels = ['Streak', 'Badges', 'Goals', 'Days'];

  return (
    <div className="py-4 space-y-6">
      <div className="flex flex-col items-center text-center gap-2">
        <div className="w-20 h-20 rounded-full gradient-rainbow flex items-center justify-center text-2xl font-bold text-white overflow-hidden shadow-md">
          {user.profilePhotoUrl ? (
            <img src={user.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            `${user.firstName[0]}${user.lastName[0]}`
          )}
        </div>
        <h1 className="text-lg font-bold text-navy">{user.fullName}</h1>
        <span className="text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-gray-100 text-navy/70">
          {user.appRole}
        </span>
        <p className="text-xs text-navy/50">{stats.daysInProgram} days in the program</p>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {statValues.map((value, i) => (
          <StatCard key={statLabels[i]} value={value} label={statLabels[i]} {...STAT_STYLES[i]} />
        ))}
      </div>

      <section>
        <SectionHeader icon="🏅" iconBg="#eef2ff" title="Badge Wall" />
        <div className="card p-4 space-y-4">
          {BADGE_CATEGORIES.map((cat) => (
            <div key={cat.key}>
              <h3 className="text-xs font-semibold text-navy/60 mb-2">{cat.label}</h3>
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

      <button onClick={handleLogout} className="pressable w-full rounded-lg py-2.5 font-semibold text-navy/70 border border-[#e5e5e5]">
        Log out
      </button>

      {isStaff && (
        <section>
          <SectionHeader icon="🧑‍💼" iconBg="#e0e7ff" title="Staff Tools" />
          <a
            href="/staff"
            className="pressable card card-lift p-4 flex items-center justify-between gradient-rainbow text-white font-semibold shadow-md"
          >
            Open Program Dashboard
            <span>→</span>
          </a>
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
