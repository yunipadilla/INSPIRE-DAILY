import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { ptDateStringNow } from '../../lib/pacificTime';

export default function MeditationGoalCard({ goal, onRefresh, onCelebrate }) {
  const today = ptDateStringNow();
  const loggedToday = goal.logs.some((l) => l.date === today);
  const [submitting, setSubmitting] = useState(false);

  const completedDays = new Set(goal.logs.filter((l) => l.logType === 'completed').map((l) => l.date));
  const totalMinutes = goal.logs.filter((l) => l.logType === 'completed').reduce((sum, l) => sum + Number(l.value || 0), 0);

  async function handleLog() {
    setSubmitting(true);
    try {
      const data = await apiFetch(`/goals/${goal.id}/log-today`, {
        method: 'POST',
        body: { minutes: goal.details.dailyTargetMinutes },
      });
      if (data.goalJustCompleted) onCelebrate(`You completed "${goal.name}"! 🎉`);
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-semibold text-navy">{goal.name}</h3>
      <div className="flex gap-4">
        <div>
          <div className="text-xl font-extrabold text-navy">{completedDays.size}</div>
          <div className="text-[10px] uppercase text-navy/50">Day Streak</div>
        </div>
        <div>
          <div className="text-xl font-extrabold text-navy">{totalMinutes}</div>
          <div className="text-[10px] uppercase text-navy/50">Total Minutes</div>
        </div>
      </div>

      {loggedToday ? (
        <p className="text-sm font-semibold text-emerald-600">✓ Logged today's meditation</p>
      ) : (
        <button onClick={handleLog} disabled={submitting} className="btn-bubble w-full py-2 text-sm text-navy gradient-goals">
          {submitting ? 'Saving…' : "Log Today's Meditation"}
        </button>
      )}
    </div>
  );
}
