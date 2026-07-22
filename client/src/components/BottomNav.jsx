import { NavLink } from 'react-router-dom';
import { Home, LineChart, Sun, Target, ClipboardList, CircleUserRound } from 'lucide-react';

const TABS = [
  { to: '/app', end: true, label: 'Home', icon: Home, activeColor: '#1a1a2e', activeBg: '#f1f1f4' },
  { to: '/app/daily-scores', label: 'Scores', icon: LineChart, activeColor: '#2563eb', activeBg: '#dbeafe' },
  { to: '/app/summer-challenge', label: 'Summer', icon: Sun, activeColor: '#d97706', activeBg: '#fef3c7' },
  { to: '/app/goals', label: 'Goals', icon: Target, activeColor: '#c026d3', activeBg: '#fae8ff' },
  {
    to: '/app/tasks',
    label: 'Tasks',
    icon: ClipboardList,
    activeColor: '#059669',
    activeBg: '#d1fae5',
    hideForRoles: ['alumni'],
  },
  { to: '/app/profile', label: 'Profile', icon: CircleUserRound, activeColor: '#6366f1', activeBg: '#e0e7ff' },
];

export default function BottomNav({ appRole }) {
  const tabs = TABS.filter((t) => !t.hideForRoles?.includes(appRole));

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#eee] flex justify-around items-center h-[72px] z-40 px-1">
      {tabs.map(({ to, end, label, icon: Icon, activeColor, activeBg }) => (
        <NavLink key={to} to={to} end={end} className="flex-1 h-full flex items-center justify-center">
          {({ isActive }) => (
            <span
              className="pressable flex flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors"
              style={{
                background: isActive ? activeBg : 'transparent',
                width: '64px',
                height: '52px',
              }}
            >
              <Icon size={20} color={isActive ? activeColor : '#9ca3af'} strokeWidth={isActive ? 2.5 : 2} />
              <span
                className="text-[10px] font-semibold"
                style={{ color: isActive ? activeColor : '#9ca3af' }}
              >
                {label}
              </span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
