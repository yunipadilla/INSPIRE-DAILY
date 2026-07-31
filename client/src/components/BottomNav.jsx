import { NavLink } from 'react-router-dom';
import { Home, LineChart, Trophy, Target, ClipboardList, CircleUserRound } from 'lucide-react';

const TABS = [
  { to: '/app', end: true, label: 'Home', icon: Home, activeColor: 'rgb(var(--color-text-primary))', activeBg: 'rgb(var(--color-surface-soft))' },
  { to: '/app/daily-scores', label: 'Scores', icon: LineChart, activeColor: 'rgb(var(--color-blue))', activeBg: 'rgb(var(--color-blue) / 0.16)' },
  { to: '/app/inspire-challenge', label: 'Challenge', icon: Trophy, activeColor: 'rgb(var(--color-warning))', activeBg: 'rgb(var(--color-yellow) / 0.35)' },
  { to: '/app/goals', label: 'Goals', icon: Target, activeColor: 'rgb(var(--color-lavender))', activeBg: 'rgb(var(--color-lavender) / 0.22)' },
  {
    to: '/app/tasks',
    label: 'Tasks',
    icon: ClipboardList,
    activeColor: 'rgb(var(--color-success))',
    activeBg: 'rgb(var(--color-success) / 0.16)',
    hideForRoles: ['alumni'],
  },
  { to: '/app/profile', label: 'Profile', icon: CircleUserRound, activeColor: 'rgb(var(--color-primary))', activeBg: 'rgb(var(--color-primary) / 0.16)' },
];

export default function BottomNav({ appRole }) {
  const tabs = TABS.filter((t) => !t.hideForRoles?.includes(appRole));

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface-elevated border-t border-border/10 flex justify-around items-center h-[72px] z-40 px-1">
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
              <Icon size={20} color={isActive ? activeColor : 'rgb(var(--color-text-muted))'} strokeWidth={isActive ? 2.5 : 2} />
              <span
                className="text-[10px] font-semibold"
                style={{ color: isActive ? activeColor : 'rgb(var(--color-text-muted))' }}
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
