import { useState } from 'react';

const LEVELS = [
  { value: 'intern', label: 'Intern' },
  { value: 'postgrad', label: 'Postgrad' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'staff', label: 'Staff' },
];

export default function StaffPostTask({ onPost }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('intern');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onPost({ title, description, level });
      setTitle('');
      setDescription('');
      setLevel('intern');
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="pressable w-full rounded-lg py-2.5 font-semibold text-navy gradient-internship-tasks"
      >
        + Post a Task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      <h3 className="font-semibold text-navy">Post a Task</h3>
      <input className="input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <textarea className="input" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label} level
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg py-2 text-sm font-semibold text-navy/60 border border-[#e5e5e5]">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="pressable flex-1 rounded-lg py-2 text-sm font-semibold text-navy gradient-internship-tasks disabled:opacity-60"
        >
          {submitting ? 'Posting…' : 'Post Task'}
        </button>
      </div>
    </form>
  );
}
