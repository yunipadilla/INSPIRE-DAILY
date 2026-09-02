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
const GOAL_TYPE_LABELS = { reading: 'Reading', fitness_daily: 'Daily Fitness', fitness_weekly: 'Weekly Fitness', learning: 'Learning', meditation: 'Meditation', custom: 'Custom' };
const PAGE_SIZE = 20;
const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

export default function GoalsHQ() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [members, setMembers] = useState(null);
  const [search, setSearch] = useState('');
  const [appRole, setAppRole] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch(`/hq/goals?days=${days}`).then(setOverview).catch(() => setError(true));
  }, [days]);

  function loadMembers() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    if (appRole) params.set('appRole', appRole);
    apiFetch(`/hq/goals/members?${params.toString()}`).then(setMembers).catch(() => setError(true));
  }
  useEffect(loadMembers, [search, appRole, page]);
  useEffect(() => setPage(1), [search, appRole]);

  if (error) return <ErrorState description="Couldn't load Goals analytics." />;
  if (!overview) return <Skeleton height="300px" />;

  const columns = [
    { key: 'name', label: 'Participant', render: (r) => `${r.firstName} ${r.lastName}` },
    { key: 'activeGoals', label: 'Active' },
    { key: 'completedGoals', label: 'Completed' },
    { key: 'completionRate', label: 'Completion %', render: (r) => pct(r.completionRate) },
    { key: 'lastGoalActivity', label: 'Last activity', render: (r) => (r.lastGoalActivity ? new Date(r.lastGoalActivity).toLocaleDateString() : '—') },
  ];
  const totalPages = members ? Math.max(1, Math.ceil(members.total / PAGE_SIZE)) : 1;
  const byTypeData = Object.entries(overview.byType).map(([type, v]) => ({ date: GOAL_TYPE_LABELS[type] || type, submissions: v.active + v.completed }));

  return (
    <div className="space-y-6">
      <PageTitle>Goals</PageTitle>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardCard label="Active goals" value={overview.activeGoals} icon="🎯" colorVar="--color-lavender" />
        <DashboardCard label="Completed goals" value={overview.completedGoals} icon="✅" colorVar="--color-success" />
        <DashboardCard label="Completion rate" value={pct(overview.completionRate)} icon="📈" colorVar="--color-blue" />
        <DashboardCard label="Total goals" value={overview.totalGoals} icon="📚" colorVar="--color-mint" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Trends</h2>
        <WindowToggle value={days} onChange={setDays} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <TrendChart data={overview.trend} dataKey="completions" label="Completions over time" colorVar="--color-success" />
        <TrendChart data={byTypeData} dataKey="submissions" label="Goals by type (active + completed)" colorVar="--color-lavender" variant="line" />
      </div>

      <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Members</h2>
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
          <DataTable columns={columns} rows={members.rows} getRowHref={(r) => `/hq/members/${r.id}`} emptyContent={<EmptyState icon="🎯" title="No members match" />} />
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
