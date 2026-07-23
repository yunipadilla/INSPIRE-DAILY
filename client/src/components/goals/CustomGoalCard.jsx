import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { ptDateStringNow } from '../../lib/pacificTime';

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
      if (data.goalJustCompleted) onCelebrate(`You completed "${goal.name}"! 🎉`);
      setAmount('');
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-semibold text-navy">{goal.name}</h3>

      {measureType === 'yesno' &&
        (checkedInToday ? (
          <p className="text-sm font-semibold text-emerald-600">✓ Checked in today</p>
        ) : (
          <button onClick={() => handleLog({})} disabled={submitting} className="btn-bubble w-full py-2 text-sm text-navy gradient-goals">
            Check In Today
          </button>
        ))}

      {measureType !== 'yesno' && (
        <>
          <div className="text-xl font-extrabold text-navy">
            {current} <span className="text-sm font-normal text-navy/50">/ {target}{measureType === 'timer' ? ' min' : ''}</span>
          </div>
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
        </>
      )}
    </div>
  );
}
