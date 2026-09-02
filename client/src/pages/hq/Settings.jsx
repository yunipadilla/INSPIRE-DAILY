import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import PageTitle from '../../components/ui/PageTitle';
import Skeleton from '../../components/ui/Skeleton';

/**
 * "Program settings" per the approved access model is an Admin/Super Admin
 * concern; this page shows every HQ user their own account context (real
 * data, not a stub) and additionally shows admins the read-only badge
 * catalog reference. No dangerous field editing lives here — the controlled
 * badge catalog stays code-defined (server/src/config/badgeCatalog.js), and
 * cohort/staff-assignment settings stay deferred with Cohorts (see
 * pages/hq/Cohorts.jsx) until that schema exists.
 */
export default function Settings() {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const isAdmin = ['admin', 'super_admin'].includes(user?.systemRole);

  useEffect(() => {
    if (isAdmin) apiFetch('/hq/badge-catalog').then((d) => setCatalog(d.catalog));
  }, [isAdmin]);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageTitle>Settings</PageTitle>

      <div className="card p-5 space-y-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-1">Your account</h2>
        <div className="text-sm text-navy"><span className="text-ink-muted">Name:</span> {user?.fullName}</div>
        <div className="text-sm text-navy"><span className="text-ink-muted">Email:</span> {user?.email}</div>
        <div className="text-sm text-navy capitalize"><span className="text-ink-muted">HQ role:</span> {user?.systemRole}</div>
        <div className="text-sm text-navy capitalize"><span className="text-ink-muted">Program role:</span> {user?.appRole}</div>
      </div>

      {isAdmin && (
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Badge catalog (reference)</h2>
          <p className="text-xs text-ink-muted">
            The controlled set of badges staff can award — defined in code for reviewability, not editable here.
          </p>
          {!catalog ? (
            <Skeleton height="120px" />
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {catalog.map((b) => (
                <div key={b.key} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-surface-soft">
                  <span>{b.iconEmoji}</span>
                  <span className="font-medium text-navy">{b.name}</span>
                  <span className="text-[10px] uppercase text-ink-muted ml-auto">{b.badgeType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card p-5 space-y-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Cohorts &amp; staff assignment</h2>
        <p className="text-xs text-ink-muted">
          Not available yet — see the Cohorts page under People. Every staff/admin/super_admin currently sees every participant.
        </p>
      </div>
    </div>
  );
}
