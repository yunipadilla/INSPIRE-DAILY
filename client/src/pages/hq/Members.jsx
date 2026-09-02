import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import FilterBar from '../../components/ui/FilterBar';
import DataTable from '../../components/ui/DataTable';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';

const APP_ROLE_OPTIONS = [
  { value: 'intern', label: 'Intern', plural: 'Interns' },
  { value: 'postgrad', label: 'Postgrad', plural: 'Postgrads' },
  { value: 'alumni', label: 'Alumni', plural: 'Alumni' },
  { value: 'staff', label: 'Staff', plural: 'Staff' },
];
const STATUS_OPTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'denied', label: 'Suspended' },
];
const ACTIVITY_OPTIONS = [
  { value: 'active', label: 'Active (14d)' },
  { value: 'inactive', label: 'Inactive' },
];
const PAGE_SIZE = 20;

export default function Members() {
  // Interns/Alumni/Staff sidebar links are saved-filter views of this same
  // page (?appRole=...) — never a separate data model, per the approved scope.
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [appRole, setAppRole] = useState(searchParams.get('appRole') || '');
  const [accountStatus, setAccountStatus] = useState('');
  const [activityState, setActivityState] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setAppRole(searchParams.get('appRole') || '');
  }, [searchParams]);

  function load() {
    setError(false);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (appRole) params.set('appRole', appRole);
    if (accountStatus) params.set('accountStatus', accountStatus);
    if (activityState) params.set('activityState', activityState);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    apiFetch(`/hq/members?${params.toString()}`).then(setData).catch(() => setError(true));
  }

  useEffect(load, [search, appRole, accountStatus, activityState, page]);
  useEffect(() => {
    setPage(1);
  }, [search, appRole, accountStatus, activityState]);

  const columns = [
    { key: 'name', label: 'Name', render: (r) => r.fullName },
    {
      key: 'appRole',
      label: 'Role',
      render: (r) => (
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-soft text-ink-secondary">
          {r.appRole}
        </span>
      ),
    },
    { key: 'accountStatus', label: 'Status', render: (r) => (r.accountStatus === 'denied' ? 'Suspended' : r.accountStatus) },
    { key: 'streakCount', label: 'Streak', render: (r) => `🔥 ${r.streakCount}` },
    { key: 'activeGoals', label: 'Active goals' },
    { key: 'challengePoints', label: 'Challenge pts', render: (r) => r.challengePoints.toFixed(0) },
    { key: 'badgeCount', label: 'Badges', render: (r) => `🏅 ${r.badgeCount}` },
    { key: 'lastActivity', label: 'Last activity', render: (r) => r.lastActivity || '—' },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const viewLabel = appRole ? APP_ROLE_OPTIONS.find((o) => o.value === appRole)?.plural : null;

  return (
    <div className="space-y-5">
      <PageTitle>{viewLabel || 'Members'}</PageTitle>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or email…"
        filters={[
          {
            key: 'appRole',
            label: 'All roles',
            value: appRole,
            onChange: (v) => {
              setAppRole(v);
              setSearchParams(v ? { appRole: v } : {});
            },
            options: APP_ROLE_OPTIONS,
          },
          { key: 'accountStatus', label: 'All statuses', value: accountStatus, onChange: setAccountStatus, options: STATUS_OPTIONS },
          { key: 'activityState', label: 'Any activity', value: activityState, onChange: setActivityState, options: ACTIVITY_OPTIONS },
        ]}
      />

      {error ? (
        <ErrorState description="Couldn't load members." onRetry={load} />
      ) : !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="52px" />
          ))}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={data.members}
            getRowHref={(row) => `/hq/members/${row.id}`}
            emptyContent={<EmptyState icon="🔍" title="No members match" description="Try a different search or filter." />}
          />

          {data.total > 0 && (
            <div className="flex items-center justify-between text-sm text-ink-muted">
              <span>
                {data.total} member{data.total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
