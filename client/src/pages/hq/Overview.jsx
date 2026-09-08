import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import DashboardCard from '../../components/ui/DashboardCard';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TrendChart from '../../components/hq/TrendChart';
import WindowToggle from '../../components/hq/WindowToggle';

function formatPct(rate) {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Monthly Program Snapshot — reusable program-wide totals (never an
 * individual's numbers; see Summary Agent for that) built entirely from
 * services/hq/monthlySnapshotService.js. Volunteer/Project Hours and
 * Inspire Challenge Points are the two primary KPIs; everything else is
 * secondary and collapsed behind "View breakdown" so the section stays
 * scannable.
 */
function MonthlyProgramSnapshot() {
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(false);
  const [showVolunteerBreakdown, setShowVolunteerBreakdown] = useState(false);
  const [showChallengeBreakdown, setShowChallengeBreakdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  function load() {
    const [year, month] = monthValue.split('-').map(Number);
    setError(false);
    apiFetch(`/hq/monthly-snapshot?year=${year}&month=${month}`).then(setSnapshot).catch(() => setError(true));
  }

  useEffect(load, [monthValue]);

  async function refresh() {
    const [year, month] = monthValue.split('-').map(Number);
    setRefreshing(true);
    try {
      const updated = await apiFetch('/hq/monthly-snapshot/refresh', { method: 'POST', body: { year, month } });
      setSnapshot(updated);
    } finally {
      setRefreshing(false);
    }
  }

  const monthLabel = snapshot
    ? new Date(snapshot.year, snapshot.month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  return (
    <section className="rise-in stagger-1">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Monthly Program Snapshot</h2>
        <label className="flex items-center gap-1.5 text-sm font-semibold text-navy bg-surface-soft rounded-lg px-3 py-1.5">
          <span>📅</span>
          <input
            type="month"
            className="bg-transparent border-none outline-none text-sm font-semibold text-navy"
            value={monthValue}
            max={currentMonthValue()}
            onChange={(e) => setMonthValue(e.target.value)}
          />
        </label>
      </div>

      {error && <ErrorState description="Couldn't load the Monthly Program Snapshot." onRetry={load} />}

      {!error && !snapshot && <Skeleton height="140px" />}

      {snapshot && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">{monthLabel}</span>
            <div className="flex items-center gap-2">
              {!snapshot.isCurrentMonth && (
                <span className="text-[10px] text-ink-muted">
                  Saved {new Date(snapshot.updatedAt).toLocaleString()} (v{snapshot.sourceVersion})
                </span>
              )}
              <button onClick={refresh} disabled={refreshing} className="btn-secondary px-3 py-1 text-xs">
                {refreshing ? 'Refreshing…' : 'Refresh Snapshot'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl p-4 gradient-inspire-challenge">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Volunteer / Project Hours</p>
              <p className="text-3xl font-extrabold text-navy mt-1">{snapshot.totalVolunteerHours.toFixed(1)} hrs</p>
              <button
                onClick={() => setShowVolunteerBreakdown((v) => !v)}
                className="text-xs font-semibold text-navy underline mt-2"
              >
                {showVolunteerBreakdown ? 'Hide breakdown' : 'View breakdown'}
              </button>
            </div>
            <div className="rounded-xl p-4 gradient-goals">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Inspire Challenge Points</p>
              <p className="text-3xl font-extrabold text-navy mt-1">{snapshot.totalChallengePoints.toLocaleString()} pts</p>
              <button
                onClick={() => setShowChallengeBreakdown((v) => !v)}
                className="text-xs font-semibold text-navy underline mt-2"
              >
                {showChallengeBreakdown ? 'Hide breakdown' : 'View breakdown'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <div className="text-lg font-extrabold text-navy">{snapshot.participantCount}</div>
              <div className="text-[10px] uppercase text-ink-muted">Active participants</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-extrabold text-navy">{snapshot.challengeDaysLogged}</div>
              <div className="text-[10px] uppercase text-ink-muted">Challenge days logged</div>
            </div>
          </div>

          {showVolunteerBreakdown && (
            <div className="border-t border-border/8 pt-3">
              <p className="text-[10px] uppercase font-bold text-ink-muted mb-1.5">Volunteer / Project Hours by participant</p>
              {snapshot.volunteerBreakdown.length === 0 ? (
                <p className="text-xs text-ink-secondary">No volunteer/project hours logged this month.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {snapshot.volunteerBreakdown.map((r) => (
                    <div key={r.userId} className="flex items-center justify-between text-sm py-0.5">
                      <span className="text-navy">{r.name}</span>
                      <span className="font-semibold text-navy">{r.hours.toFixed(1)} hrs</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showChallengeBreakdown && (
            <div className="border-t border-border/8 pt-3">
              <p className="text-[10px] uppercase font-bold text-ink-muted mb-1.5">Inspire Challenge Points by participant</p>
              {snapshot.challengeBreakdown.length === 0 ? (
                <p className="text-xs text-ink-secondary">No Challenge points logged this month.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {snapshot.challengeBreakdown.map((r) => (
                    <div key={r.userId} className="flex items-center justify-between text-sm py-0.5">
                      <span className="text-navy">{r.name}</span>
                      <span className="font-semibold text-navy">{r.points.toFixed(1)} pts · {r.daysLogged}d</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [days, setDays] = useState(30);

  function load() {
    apiFetch(`/hq/overview?days=${days}`).then(setData).catch(() => setError(true));
  }

  useEffect(() => {
    setError(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

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

  const { stats, needingAttention, recentActivity, performance, trends } = data;

  return (
    <div className="space-y-8">
      <div className="rise-in">
        <PageTitle>Overview</PageTitle>
        <p className="text-sm text-ink-secondary mt-1">
          {data.isSunday ? "It's Sunday — the program-wide rest day." : "Here's where the program stands today."}
        </p>
      </div>

      <MonthlyProgramSnapshot />

      {/* A. TODAY */}
      <section className="rise-in stagger-1">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Today</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardCard label="Active participants" value={stats.participants} icon="👥" colorVar="--color-primary" />
          <DashboardCard
            label="Daily Scores today"
            value={data.isSunday ? 'Rest day' : `${stats.dailyScoresSubmittedToday} / ${stats.dailyScoresEligibleToday}`}
            hint={data.isSunday ? undefined : `${formatPct(stats.dailyScoresCompletionRate)} participation`}
            icon="📊"
            colorVar="--color-blue"
          />
          <DashboardCard label="Active goals" value={stats.activeGoals} icon="🎯" colorVar="--color-lavender" />
          <DashboardCard label="Completed tasks" value={stats.completedTasks} icon="📋" colorVar="--color-mint" />
          <DashboardCard
            label="Challenge today"
            value={data.isChallengeLaunched ? stats.challengeParticipationToday : 'Not launched'}
            icon="🏆"
            colorVar="--color-yellow"
          />
        </div>
      </section>

      {/* B. NEEDS ATTENTION */}
      <section className="rise-in stagger-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Needs attention</h2>
        {needingAttention.length === 0 ? (
          <EmptyState icon="✨" title="Everyone's on track" description="No participant has gone 3+ days without a Daily Scores submission." />
        ) : (
          <div className="card divide-y divide-border/6 overflow-hidden">
            {needingAttention.map((p) => (
              <Link key={p.id} to={`/hq/members/${p.id}`} className="flex items-center justify-between p-3 hover:bg-surface-soft">
                <span className="text-sm font-medium text-navy">{p.firstName} {p.lastName}</span>
                <span className="text-xs text-ink-muted">{p.lastSubmission ? `Last submitted ${p.lastSubmission}` : 'Never submitted'}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* C. PROGRAM PERFORMANCE */}
      <section className="rise-in stagger-3">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Program performance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardCard label="7-day participation" value={formatPct(performance.participation7d)} icon="📈" colorVar="--color-blue" />
          <DashboardCard label="30-day participation" value={formatPct(performance.participation30d)} icon="📈" colorVar="--color-blue" />
          <DashboardCard label="Avg active streak" value={`${performance.averageActiveStreak.toFixed(1)}d`} icon="🔥" colorVar="--color-primary" />
          <DashboardCard label="Goal completion" value={formatPct(performance.goalCompletionRate)} icon="🎯" colorVar="--color-lavender" />
          <DashboardCard label="Task completion" value={formatPct(performance.taskCompletionRate)} icon="📋" colorVar="--color-mint" />
          <DashboardCard label="Volunteer hours" value={performance.totalVolunteerHours.toFixed(0)} icon="🤝" colorVar="--color-success" />
          <DashboardCard label="Challenge participants" value={performance.challengeParticipants} icon="🏆" colorVar="--color-yellow" />
          <DashboardCard label="Badges awarded" value={performance.badgesAwarded} icon="🏅" colorVar="--color-peach" />
        </div>
      </section>

      {/* D. TRENDS */}
      <section className="rise-in stagger-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Trends</h2>
          <WindowToggle value={days} onChange={setDays} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <TrendChart data={trends.dailyScoreSubmissions} dataKey="value" label="Daily Score submissions" colorVar="--color-blue" />
          <TrendChart data={trends.goalCompletions} dataKey="value" label="Goal completions" colorVar="--color-lavender" />
          <TrendChart data={trends.taskCompletions} dataKey="value" label="Task completions" colorVar="--color-mint" />
          <TrendChart data={trends.challengeParticipation} dataKey="value" label="Challenge participation" colorVar="--color-yellow" />
          <TrendChart data={trends.volunteerHours} dataKey="value" label="Volunteer hours" colorVar="--color-success" />
        </div>
      </section>

      {/* E. RECENT ACTIVITY */}
      <section className="rise-in stagger-4">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Recent activity</h2>
        {recentActivity.length === 0 ? (
          <EmptyState icon="🕒" title="No activity yet" />
        ) : (
          <div className="card divide-y divide-border/6 overflow-hidden">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 text-sm">
                <span className="text-navy">{a.firstName} {a.lastName} — {a.description}</span>
                <span className="text-xs text-ink-muted flex-shrink-0 ml-2">{new Date(a.occurredAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rise-in stagger-4">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/hq/members" className="pressable card card-lift p-4 flex items-center gap-2">
            <span className="icon-badge" style={{ background: 'rgb(var(--color-primary) / 0.16)' }}>👥</span>
            <span className="text-sm font-semibold text-navy">View all members</span>
          </Link>
          <Link to="/hq/reports" className="pressable card card-lift p-4 flex items-center gap-2">
            <span className="icon-badge" style={{ background: 'rgb(var(--color-mint) / 0.25)' }}>📄</span>
            <span className="text-sm font-semibold text-navy">Generate a report</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
