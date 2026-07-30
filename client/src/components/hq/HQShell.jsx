import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, Menu, X } from 'lucide-react';
import InspireLogo from '../InspireLogo';
import ThemeToggle from '../ui/ThemeToggle';
import Breadcrumbs from './Breadcrumbs';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { to: '/hq', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/hq/members', label: 'Members', icon: Users },
];

/**
 * Inspire HQ's shell — a sidebar-first layout, deliberately different from
 * Inspire Daily's bottom-tab AppShell (see Inspire 2.1 Part 04: Daily is
 * tab-oriented for "what should I do right now," HQ is sidebar-oriented for
 * "what's the state of the program"). Sidebar is a fixed column on desktop
 * (md+) and an off-canvas drawer below that, so the same shell works from
 * phone to desktop without two separate implementations.
 */
export default function HQShell() {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-appbg flex">
      <aside
        className={`
          bg-surface-elevated border-r border-border/8 w-64 flex-shrink-0
          flex flex-col fixed inset-y-0 left-0 z-40 transition-transform duration-200
          md:translate-x-0 md:static
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-5 flex items-center justify-between">
          <InspireLogo size={28} showTagline={false} />
          <button className="md:hidden p-1 text-navy/60" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 pb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">Inspire HQ</span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary/12 text-primary font-semibold' : 'text-ink-secondary hover:bg-surface-soft'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
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
              className="md:hidden p-1.5 -ml-1.5 text-navy/70"
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
