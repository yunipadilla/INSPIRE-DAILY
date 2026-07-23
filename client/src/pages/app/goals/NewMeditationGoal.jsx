import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FullScreenPage from '../../../components/FullScreenPage';
import { apiFetch } from '../../../lib/api';

export default function NewMeditationGoal() {
  const navigate = useNavigate();
  const [dailyTargetMinutes, setDailyTargetMinutes] = useState('');
  const [practiceDaysPerWeek, setPracticeDaysPerWeek] = useState(7);
  const [totalDurationDays, setTotalDurationDays] = useState(30);
  const [reminderTime, setReminderTime] = useState('');
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
          type: 'meditation',
          name: 'Meditation Goal',
          details: {
            dailyTargetMinutes: Number(dailyTargetMinutes),
            practiceDaysPerWeek: Number(practiceDaysPerWeek),
            totalDurationDays: Number(totalDurationDays),
            reminderTime: reminderTime || null,
          },
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
    <FullScreenPage title="Meditation Goal">
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Field label="Daily target minutes">
          <input type="number" min="1" className="input" value={dailyTargetMinutes} onChange={(e) => setDailyTargetMinutes(e.target.value)} required />
        </Field>
        <Field label="Practice days per week">
          <input type="number" min="1" max="7" className="input" value={practiceDaysPerWeek} onChange={(e) => setPracticeDaysPerWeek(e.target.value)} />
        </Field>
        <Field label="Total duration (days)">
          <input type="number" min="1" className="input" value={totalDurationDays} onChange={(e) => setTotalDurationDays(e.target.value)} />
        </Field>
        <Field label="Preferred reminder time">
          <input type="time" className="input" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-bubble w-full py-3 text-navy gradient-goals">
          {submitting ? 'Creating…' : 'Create Meditation Goal'}
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
