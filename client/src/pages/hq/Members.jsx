import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import FilterBar from '../../components/ui/FilterBar';
import DataTable from '../../components/ui/DataTable';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';

const APP_ROLE_OPTIONS = [
  { value: 'intern', label: 'Intern' },
  { value: 'postgrad', label: 'Postgrad' },
  { value: 'alumni', label: 'Alumni' },
];
const STATUS_OPTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'denied', label: 'Denied' },
];
const PAGE_SIZE = 20;

export default function Members() {
  const [search, setSearch] = useState('');
  const [appRole, setAppRole] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (appRole) params.set('appRole', appRole);
    if (accountStatus) params.set('accountStatus', accountStatus);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    apiFetch(`/hq/members?${params.toString()}`).then(setData).catch(() => setError(true));
  }

  useEffect(load, [search, appRole, accountStatus, page]);
  useEffect(() => {
    setPage(1);
  }, [search, appRole, accountStatus]);

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
    { key: 'accountStatus', label: 'Status' },
    { key: 'streakCount', label: 'Streak', render: (r) => `🔥 ${r.streakCount}` },
    { key: 'lastActivity', label: 'Last activity', render: (r) => r.lastActivity || '—' },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-5">
      <PageTitle>Members</PageTitle>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or email…"
        filters={[
          { key: 'appRole', label: 'All roles', value: appRole, onChange: setAppRole, options: APP_ROLE_OPTIONS },
          {
            key: 'accountStatus',
            label: 'All statuses',
            value: accountStatus,
            onChange: setAccountStatus,
            options: STATUS_OPTIONS,
          },
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
