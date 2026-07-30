import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const HQ_ROLES = ['staff', 'admin', 'super_admin'];

/**
 * Route guard for Inspire HQ — a real redirect, not hidden navigation.
 * Participants (and unauthenticated visitors) are sent back into Inspire
 * Daily. The server enforces the same boundary independently via
 * requireHQAccess (server/src/middleware/auth.js), so this is
 * defense-in-depth for UX, never the only gate.
 */
export default function RequireHQAccess() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-appbg">
        <div className="animate-pulse text-navy/50 font-medium">Loading…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!HQ_ROLES.includes(user.systemRole)) return <Navigate to="/app" replace />;

  return <Outlet />;
}
