import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ProgressBar from '../../components/ui/ProgressBar';

export default function MemberProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setData(null);
    apiFetch(`/hq/members/${id}`).then(setData).catch(() => setError(true));
  }

  useEffect(load, [id]);

  if (error) return <ErrorState description="Couldn't load this member's profile." onRetry={load} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton height="2rem" width="200px" />
        <Skeleton height="120px" />
        <Skeleton height="200px" />
      </div>
    );
  }

  const { user, dailyScores, goals, challenge, tasks, badges, timeline } = data;
  const activeGoals = goals.filter((g) => !g.completed);
  const completedGoals = goals.filter((g) => g.completed);

  return (
    <div className="space-y-7">
      <Link to="/hq/members" className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-navy">
        <ChevronLeft size={16} /> All members
      </Link>

      <div className="card p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full gradient-rainbow flex items-center justify-center text-xl font-bold text-white overflow-hidden flex-shrink-0">
          {user.profilePhotoUrl ? (
            <img src={user.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            `${user.firstName[0]}${user.lastName[0]}`
          )}
        </div>
        <div className="min-w-0">
          <PageTitle as="h1" className="text-xl">
            {user.fullName}
          </PageTitle>
          <p className="text-sm text-ink-secondary truncate">{user.email}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-soft text-ink-secondary">
              {user.appRole}
            </span>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-soft text-ink-secondary">
              {user.accountStatus}
            </span>
            <span className="text-xs text-ink-muted">🔥 {user.streakCount} streak</span>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Daily Scores history</h2>
        {dailyScores.length === 0 ? (
          <EmptyState icon="📊" title="No Daily Scores submissions yet" />
        ) : (
          <div className="card p-4 space-y-2">
            {dailyScores.slice(0, 14).map((d) => (
              <div key={d.date} className="flex items-center gap-3">
                <span className="text-xs text-ink-muted w-20 flex-shrink-0">{d.date}</span>
                <ProgressBar value={d.totalScore} max={50} colorVar="--color-blue" />
                <span className="text-xs font-semibold text-navy w-8 text-right flex-shrink-0">{d.totalScore}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Goals</h2>
        {goals.length === 0 ? (
          <EmptyState icon="🎯" title="No goals started yet" />
        ) : (
          <div className="card divide-y divide-border/6 overflow-hidden">
            {goals.map((g) => (
              <div key={g.id} className="flex items-center justify-between p-3 text-sm">
                <span className="text-navy">
                  {g.name} <span className="text-ink-muted">({g.type})</span>
                </span>
                <span className={g.completed ? 'text-success font-semibold' : 'text-ink-muted'}>
                  {g.completed ? `✓ Completed ${g.completedDate}` : 'In progress'}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-muted mt-2">
          {activeGoals.length} active · {completedGoals.length} completed
        </p>
      </section>

      <section>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Challenge</h2>
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm text-navy">Total points</span>
          <span className="text-lg font-extrabold text-navy">{challenge.totalPoints}</span>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Task activity</h2>
        {tasks.length === 0 ? (
          <EmptyState icon="📋" title="No task activity yet" />
        ) : (
          <div className="card divide-y divide-border/6 overflow-hidden">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 text-sm">
                <span className="text-navy">{t.title}</span>
                <span className={t.status === 'completed' ? 'text-success font-semibold' : 'text-warning font-semibold'}>
                  {t.status === 'completed' ? '✓ Completed' : 'In progress'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Badges</h2>
        {badges.length === 0 ? (
          <EmptyState icon="🏅" title="No badges earned yet" />
        ) : (
          <div className="flex gap-2 flex-wrap">
            {badges.map((b) => (
              <div
                key={b.id}
                title={`${b.name} — ${b.earnedDate}`}
                className="w-11 h-11 rounded-full gradient-rainbow shadow-sm flex items-center justify-center text-lg"
              >
                {b.iconEmoji || '🏅'}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Activity timeline</h2>
        {timeline.length === 0 ? (
          <EmptyState icon="🕒" title="No recent activity" />
        ) : (
          <div className="card divide-y divide-border/6 overflow-hidden">
            {timeline.map((t, i) => (
              <div key={i} className="flex items-center justify-between p-3 text-sm">
                <span className="text-navy">{t.description}</span>
                <span className="text-xs text-ink-muted flex-shrink-0 ml-2">
                  {new Date(t.occurredAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
