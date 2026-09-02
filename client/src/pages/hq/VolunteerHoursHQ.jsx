import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import DashboardCard from '../../components/ui/DashboardCard';
import DataTable from '../../components/ui/DataTable';
import FilterBar from '../../components/ui/FilterBar';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TrendChart from '../../components/hq/TrendChart';
import WindowToggle from '../../components/hq/WindowToggle';

const APP_ROLE_OPTIONS = [
  { value: 'intern', label: 'Intern' }, { value: 'postgrad', label: 'Postgrad' },
  { value: 'alumni', label: 'Alumni' }, { value: 'staff', label: 'Staff' },
];
const PAGE_SIZE = 20;

export default function VolunteerHoursHQ() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [members, setMembers] = useState(null);
  const [search, setSearch] = useState('');
  const [appRole, setAppRole] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch(`/hq/volunteer-hours?days=${days}`).then(setOverview).catch(() => setError(true));
  }, [days]);

  function loadMembers() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    if (appRole) params.set('appRole', appRole);
    apiFetch(`/hq/volunteer-hours/members?${params.toString()}`).then(setMembers).catch(() => setError(true));
  }
  useEffect(loadMembers, [search, appRole, page]);
  useEffect(() => setPage(1), [search, appRole]);

  if (error) return <ErrorState description="Couldn't load Volunteer Hours." />;
  if (!overview) return <Skeleton height="300px" />;

  const columns = [
    { key: 'name', label: 'Participant', render: (r) => `${r.firstName} ${r.lastName}` },
    { key: 'totalHours', label: 'Total hours', render: (r) => r.totalHours.toFixed(1) },
    { key: 'monthHours', label: 'This month', render: (r) => r.monthHours.toFixed(1) },
    { key: 'lastActivity', label: 'Latest activity', render: (r) => r.lastActivity || '—' },
  ];
  const totalPages = members ? Math.max(1, Math.ceil(members.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <PageTitle>Volunteer Hours</PageTitle>
      <p className="text-xs text-ink-muted -mt-4">
        Sourced from Daily Scores' volunteer-hours field — the single authoritative source, never double-counted with any other table.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <DashboardCard label="Total hours (all-time)" value={overview.totalHours.toFixed(1)} icon="🤝" colorVar="--color-success" />
        <DashboardCard label="Hours this month" value={overview.hoursThisMonth.toFixed(1)} icon="📅" colorVar="--color-blue" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Trend</h2>
        <WindowToggle value={days} onChange={setDays} />
      </div>
      <TrendChart data={overview.trend} dataKey="hours" label="Volunteer hours per day" colorVar="--color-success" />

      <h2 className="text-sm font-bold text-navy uppercase tracking-wide">By participant</h2>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or email…"
        filters={[{ key: 'appRole', label: 'All roles', value: appRole, onChange: setAppRole, options: APP_ROLE_OPTIONS }]}
      />
      {!members ? (
        <Skeleton height="200px" />
      ) : (
        <>
          <DataTable columns={columns} rows={members.rows} getRowHref={(r) => `/hq/members/${r.id}`} emptyContent={<EmptyState icon="🤝" title="No members match" />} />
          {members.total > 0 && (
            <div className="flex items-center justify-between text-sm text-ink-muted">
              <span>{members.total} member{members.total === 1 ? '' : 's'}</span>
              <div className="flex items-center gap-2">
                <button className="btn-secondary px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button className="btn-secondary px-3 py-1.5 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
