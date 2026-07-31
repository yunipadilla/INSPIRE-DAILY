import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { ptDateStringNow } from '../../lib/pacificTime';
import ProgressRing from '../ui/ProgressRing';

export default function FitnessWeeklyGoalCard({ goal, onRefresh, onCelebrate }) {
  const [recap, setRecap] = useState(null);
  const today = ptDateStringNow();
  const loggedToday = goal.logs.some((l) => l.date === today);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(`/goals/${goal.id}/week-recap`).then(setRecap);
  }, [goal.id, goal.logs.length]);

  async function logDay(type) {
    setSubmitting(true);
    try {
      const data = await apiFetch(`/goals/${goal.id}/log-day`, {
        method: 'POST',
        body: { date: today, type, activity: recap?.todaysActivity },
      });
      await onRefresh();
      const updatedRecap = await apiFetch(`/goals/${goal.id}/week-recap`);
      setRecap(updatedRecap);
      if (updatedRecap.isPerfectWeek) onCelebrate('Perfect Week! 🌟', 'fitness');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-3">
        {recap && (
          <ProgressRing
            value={recap.completedThisWeek}
            max={recap.activeDaysCount || 1}
            size={52}
            strokeWidth={5}
            colorVar="--color-mint"
          />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-navy">{goal.name}</h3>
          {recap?.todaysActivity ? (
            <p className="text-sm text-navy/70">Today: {recap.todaysActivity}</p>
          ) : (
            <p className="text-sm text-navy/50">Today is a rest day.</p>
          )}
        </div>
      </div>

      {loggedToday ? (
        <p className="text-sm font-semibold text-success">✓ Logged for today</p>
      ) : recap?.todaysActivity ? (
        <div className="flex gap-2">
          <button onClick={() => logDay('completed')} disabled={submitting} className="btn-bubble flex-1 py-2 text-sm text-navy gradient-goals">
            Log It
          </button>
          <button onClick={() => logDay('rest')} disabled={submitting} className="flex-1 rounded-lg py-2 text-sm font-semibold text-navy/60 border border-border/16 disabled:opacity-60">
            Rest Day
          </button>
        </div>
      ) : null}

      {recap && (
        <p className="text-xs text-navy/50">
          {recap.completedThisWeek}/{recap.activeDaysCount} active days completed this week
        </p>
      )}
    </div>
  );
}
