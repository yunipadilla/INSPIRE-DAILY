import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import DashboardCard from '../../components/ui/DashboardCard';
import DataTable from '../../components/ui/DataTable';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TrendChart from '../../components/hq/TrendChart';
import WindowToggle from '../../components/hq/WindowToggle';

const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

export default function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [roles, setRoles] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch(`/hq/analytics?days=${days}`).then(setData).catch(() => setError(true));
    apiFetch('/hq/analytics/roles').then((d) => setRoles(d.roles)).catch(() => setError(true));
  }, [days]);

  if (error) return <ErrorState description="Couldn't load Analytics." />;
  if (!data) return <Skeleton height="300px" />;

  const roleColumns = [
    { key: 'appRole', label: 'Role', render: (r) => <span className="capitalize">{r.appRole}</span> },
    { key: 'activeParticipants', label: 'Active participants' },
    { key: 'submissions', label: 'Daily Score submissions' },
    { key: 'goals', label: 'Goal completion', render: (r) => `${r.goalsCompleted}/${r.goalsTotal} (${pct(r.goalsTotal ? r.goalsCompleted / r.goalsTotal : null)})` },
    { key: 'tasks', label: 'Task completion', render: (r) => `${r.tasksCompleted}/${r.tasksTotal} (${pct(r.tasksTotal ? r.tasksCompleted / r.tasksTotal : null)})` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle>Analytics</PageTitle>
        <WindowToggle value={days} onChange={setDays} />
      </div>
      <p className="text-xs text-ink-muted -mt-4">
        Every number here is a deterministic aggregate query — the same ones the dedicated section pages use. No predictive scoring.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardCard label="7-day participation" value={pct(data.performance.participation7d)} icon="📈" colorVar="--color-blue" />
        <DashboardCard label="30-day participation" value={pct(data.performance.participation30d)} icon="📈" colorVar="--color-blue" />
        <DashboardCard label="Goal completion" value={pct(data.goals.completionRate)} icon="🎯" colorVar="--color-lavender" />
        <DashboardCard label="Challenge avg pts/entry" value={data.challenge.avgPointsPerEntry.toFixed(2)} icon="🏆" colorVar="--color-yellow" />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <TrendChart data={data.trends.dailyScoreSubmissions} dataKey="value" label="Daily Score submissions" colorVar="--color-blue" />
        <TrendChart data={data.trends.goalCompletions} dataKey="value" label="Goal completions" colorVar="--color-lavender" />
        <TrendChart data={data.trends.taskCompletions} dataKey="value" label="Task completions" colorVar="--color-mint" />
        <TrendChart data={data.trends.challengeParticipation} dataKey="value" label="Challenge participation" colorVar="--color-yellow" />
      </div>

      <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Role comparison</h2>
      {!roles ? (
        <Skeleton height="140px" />
      ) : (
        <DataTable columns={roleColumns} rows={roles} getRowKey={(r) => r.appRole} />
      )}
    </div>
  );
}
