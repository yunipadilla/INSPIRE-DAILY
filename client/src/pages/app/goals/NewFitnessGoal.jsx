import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FullScreenPage from '../../../components/FullScreenPage';
import { apiFetch } from '../../../lib/api';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function NewFitnessGoal() {
  const navigate = useNavigate();
  const [subType, setSubType] = useState('daily'); // 'daily' | 'weekly'
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Daily Target fields
  const [activity, setActivity] = useState('');
  const [dailyTarget, setDailyTarget] = useState('');
  const [totalDays, setTotalDays] = useState(30);
  const [startDate, setStartDate] = useState('');
  const [restDaysPerWeek, setRestDaysPerWeek] = useState(1);

  // Weekly Schedule fields
  const [activities, setActivities] = useState(['']);
  const [schedule, setSchedule] = useState(Object.fromEntries(DAYS.map((d) => [d, ''])));

  function setDaySchedule(day, value) {
    setSchedule((s) => ({ ...s, [day]: value }));
  }

  async function handleSubmitDaily(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiFetch('/goals', {
        method: 'POST',
        body: {
          type: 'fitness_daily',
          name: `${activity} Goal`,
          details: {
            activity,
            dailyTarget,
            totalDays: Number(totalDays),
            startDate: startDate || null,
            restDaysPerWeek: Number(restDaysPerWeek),
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

  async function handleSubmitWeekly(e) {
    e.preventDefault();
    setError('');
    const workoutDays = Object.values(schedule).filter(Boolean).length;
    if (workoutDays > 6) {
      setError('Maximum 6 workout days per week — at least 1 rest day is required.');
      return;
    }
    if (workoutDays === 7) {
      setError('At least 1 rest day per week is mandatory.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/goals', {
        method: 'POST',
        body: {
          type: 'fitness_weekly',
          name: 'Weekly Fitness Schedule',
          details: { activities: activities.filter(Boolean), schedule },
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
    <FullScreenPage title="Fitness Goal">
      <div className="flex gap-2 pt-2 mb-4">
        <button
          onClick={() => setSubType('daily')}
          className={`pressable flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${subType === 'daily' ? 'btn-bubble gradient-goals text-navy' : 'border border-[#e5e5e5] text-navy/60'}`}
        >
          Daily Target
        </button>
        <button
          onClick={() => setSubType('weekly')}
          className={`pressable flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${subType === 'weekly' ? 'btn-bubble gradient-goals text-navy' : 'border border-[#e5e5e5] text-navy/60'}`}
        >
          Weekly Schedule
        </button>
      </div>

      {subType === 'daily' ? (
        <form onSubmit={handleSubmitDaily} className="space-y-4">
          <Field label="Activity name">
            <input className="input" value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="e.g. Running" required />
          </Field>
          <Field label="Daily target">
            <input className="input" value={dailyTarget} onChange={(e) => setDailyTarget(e.target.value)} placeholder="e.g. 2 miles" required />
          </Field>
          <Field label="Number of days">
            <input type="number" min="1" className="input" value={totalDays} onChange={(e) => setTotalDays(e.target.value)} required />
          </Field>
          <Field label="Start date">
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Rest days allowed per week">
            <input type="number" min="0" max="6" className="input" value={restDaysPerWeek} onChange={(e) => setRestDaysPerWeek(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-bubble w-full py-3 text-navy gradient-goals">
            {submitting ? 'Creating…' : 'Create Fitness Goal'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmitWeekly} className="space-y-4">
          <Field label="Activities (up to 3)">
            <div className="space-y-2">
              {activities.map((a, i) => (
                <input
                  key={i}
                  className="input"
                  value={a}
                  onChange={(e) => setActivities((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder={`Activity ${i + 1}`}
                />
              ))}
              {activities.length < 3 && (
                <button type="button" onClick={() => setActivities((a) => [...a, ''])} className="text-sm font-semibold text-[#818cf8]">
                  + Add activity
                </button>
              )}
            </div>
          </Field>
          <Field label="Weekly schedule (max 6 workout days, 1+ rest day required)">
            <div className="space-y-2">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="w-24 text-sm text-navy/70">{day}</span>
                  <select className="input" value={schedule[day]} onChange={(e) => setDaySchedule(day, e.target.value)}>
                    <option value="">Rest</option>
                    {activities.filter(Boolean).map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-bubble w-full py-3 text-navy gradient-goals">
            {submitting ? 'Creating…' : 'Create Fitness Goal'}
          </button>
        </form>
      )}
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
