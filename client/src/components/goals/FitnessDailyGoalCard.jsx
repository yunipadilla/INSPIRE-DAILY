import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { ptDateStringNow } from '../../lib/pacificTime';
import ProgressRing from '../ui/ProgressRing';

const DOT_COLOR = {
  completed: 'bg-mint',
  rest: 'bg-border/24',
  missed: 'border-2 border-danger/60',
  today: 'border-2 border-dashed border-navy/30',
};

export default function FitnessDailyGoalCard({ goal, onRefresh, onCelebrate }) {
  const today = ptDateStringNow();
  const loggedToday = goal.logs.some((l) => l.date === today);
  const [submitting, setSubmitting] = useState(false);

  async function logDay(type) {
    setSubmitting(true);
    try {
      const data = await apiFetch(`/goals/${goal.id}/log-day`, { method: 'POST', body: { date: today, type } });
      if (data.goalJustCompleted) onCelebrate(`You completed "${goal.name}"! 🎉`, 'fitness');
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  const completedCount = goal.logs.filter((l) => l.log_type === 'completed' || l.logType === 'completed').length;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-3">
        <ProgressRing value={completedCount} max={goal.details.totalDays || 1} size={52} strokeWidth={5} colorVar="--color-mint" />
        <div className="flex-1">
          <h3 className="font-semibold text-navy">{goal.name}</h3>
          <p className="text-sm text-navy/50">{goal.details.dailyTarget}</p>
        </div>
      </div>

      {loggedToday ? (
        <p className="text-sm font-semibold text-success">✓ Logged for today</p>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => logDay('completed')} disabled={submitting} className="btn-bubble flex-1 py-2 text-sm text-navy gradient-goals">
            Log It
          </button>
          <button onClick={() => logDay('rest')} disabled={submitting} className="flex-1 rounded-lg py-2 text-sm font-semibold text-navy/60 border border-border/16 disabled:opacity-60">
            Rest Day
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {goal.logs.map((l) => (
          <span key={l.id} className={`w-3 h-3 rounded-full ${DOT_COLOR[l.logType] || 'bg-surface-soft'}`} title={`${l.date}: ${l.logType}`} />
        ))}
      </div>
    </div>
  );
}
