import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { ptDateStringNow } from '../../lib/pacificTime';
import ProgressRing from '../ui/ProgressRing';

export default function CustomGoalCard({ goal, onRefresh, onCelebrate }) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { measureType, target, current = 0 } = goal.details;
  const today = ptDateStringNow();
  const checkedInToday = goal.logs.some((l) => l.date === today);

  async function handleLog(body) {
    setSubmitting(true);
    try {
      const data = await apiFetch(`/goals/${goal.id}/log`, { method: 'POST', body });
      if (data.goalJustCompleted) onCelebrate(`You completed "${goal.name}"! 🎉`, 'custom');
      setAmount('');
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-3">
        {measureType !== 'yesno' && (
          <ProgressRing value={current} max={target || 1} size={52} strokeWidth={5} colorVar="--color-lavender" />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-navy">{goal.name}</h3>
          {measureType !== 'yesno' && (
            <p className="text-sm text-navy/50">
              {current} / {target}
              {measureType === 'timer' ? ' min' : ''}
            </p>
          )}
        </div>
      </div>

      {measureType === 'yesno' &&
        (checkedInToday ? (
          <p className="text-sm font-semibold text-success">✓ Checked in today</p>
        ) : (
          <button onClick={() => handleLog({})} disabled={submitting} className="btn-bubble w-full py-2 text-sm text-navy gradient-goals">
            Check In Today
          </button>
        ))}

      {measureType !== 'yesno' && (
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            placeholder={measureType === 'timer' ? 'Minutes' : 'Amount'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input flex-1"
          />
          <button
            onClick={() => handleLog({ amount: Number(amount) })}
            disabled={submitting || !amount}
            className="pressable rounded-lg px-4 text-sm font-semibold text-navy gradient-goals disabled:opacity-60"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
