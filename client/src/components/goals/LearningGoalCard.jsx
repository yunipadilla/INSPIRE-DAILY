import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import ProgressRing from '../ui/ProgressRing';

export default function LearningGoalCard({ goal, onRefresh, onCelebrate }) {
  const [logging, setLogging] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalMinutes = goal.logs.filter((l) => l.logType === 'session').reduce((sum, l) => sum + Number(l.value || 0), 0);

  async function handleLog() {
    if (!minutes) return;
    setSubmitting(true);
    try {
      const data = await apiFetch(`/goals/${goal.id}/log-session`, { method: 'POST', body: { minutes: Number(minutes), note } });
      if (data.goalJustCompleted) onCelebrate(`You completed "${goal.name}"! 🎉`, 'learning');
      setMinutes('');
      setNote('');
      setLogging(false);
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-3">
        <ProgressRing value={totalMinutes} max={goal.details.targetMinutes || 1} size={52} strokeWidth={5} colorVar="--color-primary" />
        <div className="flex-1">
          <h3 className="font-semibold text-navy">{goal.name}</h3>
          <p className="text-sm text-navy/50">
            {totalMinutes} / {goal.details.targetMinutes} min
          </p>
        </div>
      </div>

      {logging ? (
        <div className="space-y-2">
          <input type="number" min="1" placeholder="Minutes practiced" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="input" />
          <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="input" />
          <button onClick={handleLog} disabled={submitting} className="btn-bubble w-full py-2 text-sm text-navy gradient-goals">
            {submitting ? 'Saving…' : 'Save Session'}
          </button>
        </div>
      ) : (
        <button onClick={() => setLogging(true)} className="btn-bubble w-full py-2 text-sm text-navy gradient-goals">
          Log a Session
        </button>
      )}
    </div>
  );
}
