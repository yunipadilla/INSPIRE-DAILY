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
const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

export default function DailyScoresHQ() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [members, setMembers] = useState(null);
  const [search, setSearch] = useState('');
  const [appRole, setAppRole] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch(`/hq/daily-scores?days=${days}`).then(setOverview).catch(() => setError(true));
  }, [days]);

  function loadMembers() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    if (appRole) params.set('appRole', appRole);
    apiFetch(`/hq/daily-scores/members?${params.toString()}`).then(setMembers).catch(() => setError(true));
  }
  useEffect(loadMembers, [search, appRole, page]);
  useEffect(() => setPage(1), [search, appRole]);

  if (error) return <ErrorState description="Couldn't load Daily Scores analytics." />;
  if (!overview) return <Skeleton height="300px" />;

  const columns = [
    { key: 'name', label: 'Name', render: (r) => `${r.firstName} ${r.lastName}` },
    { key: 'submittedToday', label: 'Today', render: (r) => (r.submittedToday ? '✅' : '—') },
    { key: 'streakCount', label: 'Streak', render: (r) => `🔥 ${r.streakCount}` },
    { key: 'lastSubmission', label: 'Last submission', render: (r) => r.lastSubmission || 'Never' },
    { key: 'completion7d', label: '7-day %', render: (r) => pct(r.completion7d) },
    { key: 'completion30d', label: '30-day %', render: (r) => pct(r.completion30d) },
  ];
  const totalPages = members ? Math.max(1, Math.ceil(members.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <PageTitle>Daily Scores</PageTitle>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardCard label="Submitted today" value={overview.isSunday ? 'Rest day' : `${overview.submittedToday}/${overview.participantCount}`} icon="✅" colorVar="--color-success" hint={overview.isSunday ? undefined : pct(overview.participationRateToday)} />
        <DashboardCard label="Pending today" value={overview.isSunday ? 0 : overview.pendingToday} icon="⏳" colorVar="--color-warning" />
        <DashboardCard label="Active streaks" value={overview.activeStreakCount} icon="🔥" colorVar="--color-primary" />
        <DashboardCard label="Avg streak" value={overview.averageStreak.toFixed(1)} icon="📈" colorVar="--color-blue" />
        <DashboardCard label="Missing 3+ days" value={overview.missing3PlusDays} icon="⚠️" colorVar="--color-danger" />
        <DashboardCard label="Avg Best Self" value={overview.windowAverages.bestSelf.toFixed(1)} icon="⭐" colorVar="--color-lavender" />
        <DashboardCard label="Avg Grit" value={overview.windowAverages.grit.toFixed(1)} icon="💪" colorVar="--color-mint" />
        <DashboardCard label="Avg Happiness" value={overview.windowAverages.happiness.toFixed(1)} icon="😊" colorVar="--color-yellow" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Trends</h2>
        <WindowToggle value={days} onChange={setDays} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <TrendChart data={overview.trend} dataKey="submissions" label="Submissions per day" colorVar="--color-blue" />
        <TrendChart data={overview.trend} dataKey="bestSelf" secondaryKey="grit" secondaryLabel="Grit" label="Best Self vs Grit (avg)" colorVar="--color-lavender" secondaryColorVar="--color-mint" />
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
          <DataTable columns={columns} rows={members.rows} getRowHref={(r) => `/hq/members/${r.id}`} emptyContent={<EmptyState icon="📊" title="No members match" />} />
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
