import { useState } from 'react';

export default function MyTaskCard({ signup, onComplete }) {
  const [expanded, setExpanded] = useState(false);
  const [hoursSpent, setHoursSpent] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isCompleted = signup.status === 'completed';

  async function handleComplete() {
    setSubmitting(true);
    try {
      await onComplete(signup.id, { hoursSpent: Number(hoursSpent) || null, notes: notes || null });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-navy">{signup.title}</h3>
        <span
          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${
            isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
          }`}
        >
          {isCompleted ? 'Completed' : 'In Progress'}
        </span>
      </div>
      {signup.description && <p className="text-sm text-navy/60">{signup.description}</p>}

      {isCompleted ? (
        <p className="text-xs text-navy/40">
          {signup.hoursSpent ? `${signup.hoursSpent} hrs · ` : ''}
          Completed {signup.completedDate}
        </p>
      ) : expanded ? (
        <div className="space-y-2 pt-1">
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="Hours spent"
            value={hoursSpent}
            onChange={(e) => setHoursSpent(e.target.value)}
            className="input"
          />
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            rows={2}
          />
          <button
            onClick={handleComplete}
            disabled={submitting}
            className="btn-bubble w-full py-2 text-sm text-navy gradient-internship-tasks"
          >
            {submitting ? 'Saving…' : 'Mark Complete'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="text-sm font-semibold text-emerald-600"
        >
          Mark Complete →
        </button>
      )}
    </div>
  );
}
