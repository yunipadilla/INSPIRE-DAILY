import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FullScreenPage from '../../../components/FullScreenPage';
import { apiFetch } from '../../../lib/api';

export default function NewLearningGoal() {
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [targetMinutes, setTargetMinutes] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/goals', {
        method: 'POST',
        body: {
          type: 'learning',
          name: `Learn ${subject}`,
          targetDate: targetDate || null,
          details: { subject, targetMinutes: Number(targetMinutes) },
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
    <FullScreenPage title="Learning Goal">
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Field label="Subject name">
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Spanish" required />
        </Field>
        <Field label="Total target minutes">
          <input type="number" min="1" className="input" value={targetMinutes} onChange={(e) => setTargetMinutes(e.target.value)} required />
        </Field>
        <Field label="Target date">
          <input type="date" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-lg py-3 font-semibold text-navy gradient-goals disabled:opacity-60">
          {submitting ? 'Creating…' : 'Create Learning Goal'}
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
