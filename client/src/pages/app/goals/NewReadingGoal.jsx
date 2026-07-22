import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FullScreenPage from '../../../components/FullScreenPage';
import { apiFetch } from '../../../lib/api';

export default function NewReadingGoal() {
  const navigate = useNavigate();
  const [name, setName] = useState('Reading Goal');
  const [booksTarget, setBooksTarget] = useState(1);
  const [targetDate, setTargetDate] = useState('');
  const [books, setBooks] = useState([{ title: '', author: '', totalPages: '', startDate: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function setBooksCount(n) {
    const count = Math.max(1, Math.min(20, Number(n) || 1));
    setBooksTarget(count);
    setBooks((prev) => {
      const next = [...prev];
      while (next.length < count) next.push({ title: '', author: '', totalPages: '', startDate: '' });
      return next.slice(0, count);
    });
  }

  function updateBook(i, field, value) {
    setBooks((prev) => prev.map((b, idx) => (idx === i ? { ...b, [field]: value } : b)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (books.some((b) => !b.title.trim() || !b.totalPages)) {
      setError('Every book needs a title and total page count.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/goals', {
        method: 'POST',
        body: {
          type: 'reading',
          name,
          targetDate: targetDate || null,
          details: { booksTarget },
          books: books.map((b) => ({ ...b, totalPages: Number(b.totalPages) })),
        },
      });
      navigate('/app/goals');
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FullScreenPage title="Reading Goal">
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Field label="Goal name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Total number of books to read">
          <input type="number" min="1" max="20" className="input" value={booksTarget} onChange={(e) => setBooksCount(e.target.value)} />
        </Field>
        <Field label="Target date">
          <input type="date" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>

        <div className="space-y-3">
          {books.map((b, i) => (
            <div key={i} className="card p-4 space-y-2">
              <h3 className="text-sm font-semibold text-navy">Book {i + 1}</h3>
              <input className="input" placeholder="Title" value={b.title} onChange={(e) => updateBook(i, 'title', e.target.value)} required />
              <input className="input" placeholder="Author (optional)" value={b.author} onChange={(e) => updateBook(i, 'author', e.target.value)} />
              <input
                type="number"
                min="1"
                className="input"
                placeholder="Total page count"
                value={b.totalPages}
                onChange={(e) => updateBook(i, 'totalPages', e.target.value)}
                required
              />
              <input type="date" className="input" value={b.startDate} onChange={(e) => updateBook(i, 'startDate', e.target.value)} />
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button type="submit" disabled={submitting} className="w-full rounded-lg py-3 font-semibold text-navy gradient-goals disabled:opacity-60">
          {submitting ? 'Creating…' : 'Create Reading Goal'}
        </button>
      </form>
    </FullScreenPage>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy mb-1">{label}</label>
      {children}
    </div>
  );
}
