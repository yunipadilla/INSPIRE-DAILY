import { useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function ReadingGoalCard({ goal, onRefresh, onCelebrate }) {
  const [pageInputs, setPageInputs] = useState({});
  const [saving, setSaving] = useState(null);

  async function handleSave(bookId) {
    const currentPage = Number(pageInputs[bookId]);
    if (Number.isNaN(currentPage)) return;
    setSaving(bookId);
    try {
      const data = await apiFetch(`/goals/${goal.id}/books/${bookId}`, {
        method: 'PATCH',
        body: { currentPage },
      });
      if (data.bookJustCompleted) {
        const book = data.goal.books.find((b) => b.id === bookId);
        onCelebrate(`You finished "${book?.title}"! 📖`);
      }
      if (data.goalJustCompleted) {
        onCelebrate(`You completed "${goal.name}"! 🎉`);
      }
      await onRefresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-semibold text-navy">{goal.name}</h3>
      <div className="space-y-3">
        {goal.books.map((b) => (
          <div key={b.id} className="border border-[#f0f0f0] rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-navy">
                {b.title} {b.completed && '✅'}
              </span>
              <span className="text-xs text-navy/50">
                {b.currentPage}/{b.totalPages} pages
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#f0f0f0] overflow-hidden">
              <div className="h-full gradient-goals" style={{ width: `${b.progressPct}%` }} />
            </div>
            {!b.completed && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max={b.totalPages}
                  placeholder="Current page"
                  value={pageInputs[b.id] ?? ''}
                  onChange={(e) => setPageInputs((p) => ({ ...p, [b.id]: e.target.value }))}
                  className="input flex-1"
                />
                <button
                  onClick={() => handleSave(b.id)}
                  disabled={saving === b.id}
                  className="pressable rounded-lg px-3 text-sm font-semibold text-navy gradient-goals disabled:opacity-60"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
