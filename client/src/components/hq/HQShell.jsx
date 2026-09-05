import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, GraduationCap, School, Award, Building2, FolderTree,
  BarChart3, Target, Trophy, HandHeart, ClipboardList,
  FileText, LineChart, Settings, Menu, X,
} from 'lucide-react';
import InspireLogo from '../InspireLogo';
import ThemeToggle from '../ui/ThemeToggle';
import Breadcrumbs from './Breadcrumbs';
import { useAuth } from '../../context/AuthContext';

/**
 * Grouped sidebar nav — Inspire HQ 2.0. Groups mirror the mental model
 * "who am I looking at" (People), "what are they doing" (Program), "how is
 * it all going" (Insights), matching the Overview page's own hierarchy.
 * `end: true` only on Overview so its NavLink doesn't stay highlighted for
 * every nested /hq/* route.
 */
const NAV_GROUPS = [
  { items: [{ to: '/hq', end: true, label: 'Overview', icon: LayoutDashboard }] },
  {
    title: 'People',
    items: [
      { to: '/hq/members', label: 'Members', icon: Users },
      { to: '/hq/members?appRole=intern', label: 'Interns', icon: GraduationCap },
      { to: '/hq/members?appRole=postgrad', label: 'Postgrads', icon: School },
      { to: '/hq/members?appRole=alumni', label: 'Alumni', icon: Award },
      { to: '/hq/members?appRole=staff', label: 'Staff', icon: Building2 },
      { to: '/hq/people/cohorts', label: 'Cohorts / Groups', icon: FolderTree },
    ],
  },
  {
    title: 'Program',
    items: [
      { to: '/hq/daily-scores', label: 'Daily Scores', icon: BarChart3 },
      { to: '/hq/goals', label: 'Goals', icon: Target },
      { to: '/hq/challenge', label: 'Inspire Challenge', icon: Trophy },
      { to: '/hq/volunteer-hours', label: 'Volunteer Hours', icon: HandHeart },
      { to: '/hq/tasks', label: 'Tasks', icon: ClipboardList },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/hq/reports', label: 'Reports', icon: FileText },
      { to: '/hq/analytics', label: 'Analytics', icon: LineChart },
    ],
  },
  { title: 'System', items: [{ to: '/hq/settings', label: 'Settings', icon: Settings }] },
];

function NavItem({ to, end, label, icon: Icon, onClick }) {
  // Query-string nav entries (Interns/Alumni/Staff saved filter views) need
  // isActive computed against the full path+search, since react-router's own
  // NavLink `end` matching ignores search params.
  const [pathname, search] = to.split('?');
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) => {
        const searchMatches = typeof window !== 'undefined' ? window.location.search === `?${search || ''}` || (!search && !window.location.search) : true;
        const active = search ? isActive && searchMatches : isActive;
        return `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
          active ? 'bg-primary/12 text-primary font-semibold' : 'text-ink-secondary hover:bg-surface-soft'
        }`;
      }}
    >
      <Icon size={17} />
      {label}
    </NavLink>
  );
}

export default function HQShell() {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAdmin = ['admin', 'super_admin'].includes(user?.systemRole);

  return (
    <div className="min-h-screen bg-appbg flex">
      <aside
        className={`
          bg-surface-elevated border-r border-border/8 w-64 flex-shrink-0
          flex flex-col fixed inset-y-0 left-0 z-40 transition-transform duration-200 overflow-y-auto
          md:translate-x-0 md:static
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-5 flex items-center justify-between">
          <InspireLogo size={28} showTagline={false} />
          <button className="md:hidden p-1 text-ink-secondary" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Inspire HQ</span>
          {isAdmin && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-lavender/20 text-ink-secondary">Admin</span>
          )}
        </div>
        <nav className="flex-1 px-3 space-y-4 pb-4">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.title || gi}>
              {group.title && (
                <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-ink-muted">{group.title}</p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.to} {...item} onClick={() => setDrawerOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-4 border-t border-border/8">
          <p className="text-xs font-semibold text-navy truncate">{user?.fullName}</p>
          <p className="text-[11px] text-ink-muted truncate mb-2 capitalize">{user?.systemRole}</p>
          <button onClick={logout} className="text-xs font-semibold text-danger pressable">
            Log out
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-appbg/95 backdrop-blur border-b border-border/8 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden p-1.5 -ml-1.5 text-ink-secondary"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <Breadcrumbs />
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
