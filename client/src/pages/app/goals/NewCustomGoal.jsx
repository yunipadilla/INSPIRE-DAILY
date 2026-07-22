import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FullScreenPage from '../../../components/FullScreenPage';
import { apiFetch } from '../../../lib/api';

const MEASURE_TYPES = [
  { value: 'yesno', label: 'Yes or No', desc: 'Simple daily check-in' },
  { value: 'counter', label: 'Number Counter', desc: 'Track progress toward a target number' },
  { value: 'timer', label: 'Time Tracker', desc: 'Track minutes toward a target' },
];

export default function NewCustomGoal() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [measureType, setMeasureType] = useState('yesno');
  const [target, setTarget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (measureType !== 'yesno' && !target) {
      setError('A target number is required for this measurement type.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/goals', {
        method: 'POST',
        body: {
          type: 'custom',
          name,
          details: { measureType, target: measureType === 'yesno' ? null : Number(target), current: 0 },
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
    <FullScreenPage title="Custom Goal">
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <Field label="Goal name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drink less soda" required />
        </Field>
        <Field label="How do you want to measure it?">
          <div className="space-y-2">
            {MEASURE_TYPES.map((m) => (
              <label
                key={m.value}
                className={`block border rounded-lg p-3 cursor-pointer ${
                  measureType === m.value ? 'border-[#d946ef] bg-[#f9a8d4]/10' : 'border-[#e5e5e5]'
                }`}
              >
                <input type="radio" name="measureType" className="hidden" checked={measureType === m.value} onChange={() => setMeasureType(m.value)} />
                <div className="font-semibold text-navy text-sm">{m.label}</div>
                <div className="text-xs text-navy/50">{m.desc}</div>
              </label>
            ))}
          </div>
        </Field>
        {measureType !== 'yesno' && (
          <Field label={measureType === 'timer' ? 'Target minutes' : 'Target number'}>
            <input type="number" min="1" className="input" value={target} onChange={(e) => setTarget(e.target.value)} required />
          </Field>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-lg py-3 font-semibold text-navy gradient-goals disabled:opacity-60">
          {submitting ? 'Creating…' : 'Create Custom Goal'}
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
