import { useState } from 'react';
import { apiFetch } from '../../lib/api';

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
      if (data.goalJustCompleted) onCelebrate(`You completed "${goal.name}"! 🎉`);
      setMinutes('');
      setNote('');
      setLogging(false);
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-semibold text-navy">{goal.name}</h3>
      <div className="text-2xl font-extrabold text-navy">
        {totalMinutes} <span className="text-sm font-normal text-navy/50">/ {goal.details.targetMinutes} min</span>
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
