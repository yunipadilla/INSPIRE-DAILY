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
const PODIUM_STYLE = ['bg-yellow/20 border-yellow', 'bg-surface-soft border-border/20', 'bg-peach/20 border-peach'];

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ChallengeHQ() {
  const [days, setDays] = useState(30);
  const [month, setMonth] = useState(currentMonthValue());
  const [overview, setOverview] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [members, setMembers] = useState(null);
  const [search, setSearch] = useState('');
  const [appRole, setAppRole] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch(`/hq/challenge?days=${days}&month=${month}`).then(setOverview).catch(() => setError(true));
    apiFetch(`/hq/challenge/leaderboard?month=${month}`).then((d) => setLeaderboard(d.entries)).catch(() => setError(true));
  }, [days, month]);

  function loadMembers() {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) params.set('search', search);
    if (appRole) params.set('appRole', appRole);
    apiFetch(`/hq/challenge/members?${params.toString()}`).then(setMembers).catch(() => setError(true));
  }
  useEffect(loadMembers, [search, appRole, page]);
  useEffect(() => setPage(1), [search, appRole]);

  if (error) return <ErrorState description="Couldn't load Inspire Challenge analytics." />;
  if (!overview) return <Skeleton height="300px" />;

  const columns = [
    { key: 'rank', label: '#' },
    { key: 'name', label: 'Participant', render: (r) => `${r.firstName} ${r.lastName}` },
    { key: 'totalPoints', label: 'All-time pts', render: (r) => r.totalPoints.toFixed(1) },
    { key: 'daysLogged', label: 'Days logged' },
    { key: 'avgPointsPerDay', label: 'Avg pts/day', render: (r) => r.avgPointsPerDay.toFixed(2) },
    { key: 'lastActivity', label: 'Last activity', render: (r) => r.lastActivity || '—' },
  ];
  const totalPages = members ? Math.max(1, Math.ceil(members.total / PAGE_SIZE)) : 1;
  const podium = (leaderboard || []).slice(0, 3);
  const rest = (leaderboard || []).slice(3);
  const cats = overview.categoryParticipation;

  return (
    <div className="space-y-6">
      <PageTitle>Inspire Challenge</PageTitle>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardCard label="Participants" value={overview.participants} icon="👥" colorVar="--color-primary" />
        <DashboardCard label="Points this month" value={overview.totalPoints.toFixed(0)} icon="🏆" colorVar="--color-yellow" />
        <DashboardCard label="Active days" value={overview.activeDays} icon="📅" colorVar="--color-blue" />
        <DashboardCard label="Avg pts/entry" value={overview.avgPointsPerEntry.toFixed(2)} icon="📈" colorVar="--color-lavender" />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Monthly leaderboard</h2>
        <input type="month" className="input-bubble w-auto text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {podium.length === 0 ? (
        <EmptyState icon="🏆" title="No Challenge activity this month" />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {podium.map((p, i) => (
            <div key={p.id} className={`card p-4 text-center border-2 ${PODIUM_STYLE[i]}`}>
              <div className="text-2xl mb-1">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
              <p className="text-sm font-bold text-navy truncate">{p.firstName} {p.lastName}</p>
              <p className="text-xs text-ink-muted">{p.score.toFixed(1)} pts</p>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <DataTable
          columns={[
            { key: 'rank', label: '#' },
            { key: 'name', label: 'Participant', render: (r) => `${r.firstName} ${r.lastName}` },
            { key: 'score', label: 'Points', render: (r) => r.score.toFixed(1) },
          ]}
          rows={rest}
        />
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Trends</h2>
        <WindowToggle value={days} onChange={setDays} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <TrendChart data={overview.trend} dataKey="points" label="Daily points" colorVar="--color-yellow" />
        <TrendChart data={overview.trend} dataKey="submissions" label="Daily submissions" colorVar="--color-blue" />
      </div>

      <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Category participation (this month)</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashboardCard label="Bed before 10" value={`${Math.round((cats.sleep_bed_before_10 || 0) * 100)}%`} icon="🛌" colorVar="--color-lavender" />
        <DashboardCard label="Hydration" value={`${Math.round((cats.hydration || 0) * 100)}%`} icon="💧" colorVar="--color-blue" />
        <DashboardCard label="Exercise" value={`${Math.round((cats.exercise || 0) * 100)}%`} icon="🏃" colorVar="--color-success" />
        <DashboardCard label="Nutrition" value={`${Math.round((cats.nutrition || 0) * 100)}%`} icon="🥗" colorVar="--color-mint" />
        <DashboardCard label="Daily update sent" value={`${Math.round((cats.daily_update_sent || 0) * 100)}%`} icon="📨" colorVar="--color-peach" />
        <DashboardCard label="Avg mindfulness" value={(cats.mindfulness_sessions || 0).toFixed(1)} icon="🧘" colorVar="--color-lavender" />
        <DashboardCard label="Avg reading" value={(cats.reading_sessions || 0).toFixed(1)} icon="📖" colorVar="--color-blue" />
        <DashboardCard label="Cold plunge/shower" value={`${cats.cold_plunge_count || 0} / ${cats.cold_shower_count || 0}`} icon="🧊" colorVar="--color-blue" />
      </div>

      <h2 className="text-sm font-bold text-navy uppercase tracking-wide">All participants (all-time)</h2>
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
          <DataTable columns={columns} rows={members.rows} getRowHref={(r) => `/hq/members/${r.id}`} emptyContent={<EmptyState icon="🏆" title="No members match" />} />
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
