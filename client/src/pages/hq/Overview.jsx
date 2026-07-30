import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import DashboardCard from '../../components/ui/DashboardCard';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';

function formatPct(rate) {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}% completion`;
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setData(null);
    apiFetch('/hq/overview').then(setData).catch(() => setError(true));
  }

  useEffect(load, []);

  if (error) return <ErrorState description="Couldn't load the Overview dashboard." onRetry={load} />;

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton height="2rem" width="240px" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="96px" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="rise-in">
        <PageTitle>Overview</PageTitle>
        <p className="text-sm text-ink-secondary mt-1">
          {data.isSunday ? "It's Sunday — the program-wide rest day." : "Here's where the program stands today."}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 rise-in stagger-1">
        <DashboardCard label="Active participants" value={data.stats.participants} icon="👥" colorVar="--color-primary" />
        <DashboardCard
          label="Daily Scores today"
          value={
            data.isSunday ? 'Rest day' : `${data.stats.dailyScoresSubmittedToday} / ${data.stats.dailyScoresEligibleToday}`
          }
          hint={data.isSunday ? undefined : formatPct(data.stats.dailyScoresCompletionRate)}
          icon="📊"
          colorVar="--color-blue"
        />
        <DashboardCard label="Active goals" value={data.stats.activeGoals} icon="🎯" colorVar="--color-lavender" />
        <DashboardCard label="Completed tasks" value={data.stats.completedTasks} icon="📋" colorVar="--color-mint" />
      </div>

      <section className="rise-in stagger-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Needing attention</h2>
        {data.needingAttention.length === 0 ? (
          <EmptyState
            icon="✨"
            title="Everyone's on track"
            description="No participant has gone 3+ days without a Daily Scores submission."
          />
        ) : (
          <div className="card divide-y divide-border/6 overflow-hidden">
            {data.needingAttention.map((p) => (
              <Link
                key={p.id}
                to={`/hq/members/${p.id}`}
                className="flex items-center justify-between p-3 hover:bg-surface-soft"
              >
                <span className="text-sm font-medium text-navy">
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-xs text-ink-muted">
                  {p.lastSubmission ? `Last submitted ${p.lastSubmission}` : 'Never submitted'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rise-in stagger-3">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Recent activity</h2>
        {data.recentActivity.length === 0 ? (
          <EmptyState icon="🕒" title="No activity yet" />
        ) : (
          <div className="card divide-y divide-border/6 overflow-hidden">
            {data.recentActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 text-sm">
                <span className="text-navy">
                  {a.firstName} {a.lastName} — {a.description}
                </span>
                <span className="text-xs text-ink-muted flex-shrink-0 ml-2">
                  {new Date(a.occurredAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rise-in stagger-4">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/hq/members" className="pressable card card-lift p-4 flex items-center gap-2">
            <span className="icon-badge" style={{ background: '#eef2ff' }}>
              👥
            </span>
            <span className="text-sm font-semibold text-navy">View all members</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
