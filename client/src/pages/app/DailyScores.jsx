import { useEffect, useState } from 'react';
import ScoreSlider from '../../components/ScoreSlider';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { ptDateStringNow } from '../../lib/pacificTime';

const QUESTIONS = [
  { key: 'bestSelf', label: 'Best Self', question: 'How close were you to your best self today?', low: 'Worst Self', high: 'Best Self' },
  { key: 'ceoMindset', label: 'CEO Mindset', question: 'How proactive and self-starting were you today?', low: 'Reactive all day', high: 'Fully in control' },
  { key: 'grit', label: 'Grit', question: 'How well did you push through hard or boring things?', low: 'Gave up immediately', high: 'Stayed with it all day' },
  { key: 'happiness', label: 'Happiness', question: 'How would you rate your mood and wellbeing today?', low: 'Really struggling', high: 'Thriving' },
  { key: 'sleep', label: 'Sleep', question: 'How was your sleep last night?', low: 'Barely slept', high: 'Best sleep ever' },
];

const DEFAULT_SLIDERS = Object.fromEntries(QUESTIONS.map((q) => [q.key, 5]));

export default function DailyScores() {
  const { user } = useAuth();
  const [today, setToday] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [challenges, setChallenges] = useState('');
  const [earnedWay, setEarnedWay] = useState(null);
  const [volunteerHours, setVolunteerHours] = useState('');
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS);
  const [goalsWorkedOn, setGoalsWorkedOn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/daily-scores/today').then(setToday);
    if (user) setDisplayName(user.fullName);
  }, [user]);

  const total = Object.values(sliders).reduce((a, b) => a + b, 0);

  async function handleSubmit() {
    setError('');
    if (earnedWay === null) {
      setError('Please answer whether you earned your way today.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch('/daily-scores', {
        method: 'POST',
        body: {
          displayName,
          challenges,
          earnedWay,
          volunteerHours: Number(volunteerHours) || 0,
          goalsWorkedOn,
          ...sliders,
        },
      });
      setResult(data);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!today) {
    return <div className="py-10 text-center text-navy/50">Loading…</div>;
  }

  if (today.isSunday) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="text-4xl">☀️</div>
        <h1 className="text-xl font-bold text-navy">Today is Sunday — your rest day.</h1>
        <p className="text-navy/60 max-w-xs mx-auto">
          Daily Scores are not required today. Enjoy your day off and come back stronger tomorrow.
        </p>
      </div>
    );
  }

  const alreadyDone = today.alreadySubmitted || Boolean(result);
  const streakCount = result?.streakCount ?? today.streakCount;
  const streakShields = result?.streakShields ?? today.streakShields;

  if (alreadyDone) {
    return (
      <div className="py-4 space-y-4">
        <Header />
        <div className="card p-6 text-center space-y-2">
          <div className="text-3xl">✅</div>
          <h1 className="text-lg font-bold text-navy">Daily Scores submitted for today!</h1>
          <p className="text-navy/60 text-sm">
            Total score: {result?.totalScore ?? today.existing?.totalScore} / 50
          </p>
          {result?.earnedShield && (
            <p className="text-sm font-semibold text-emerald-600">🛡️ You earned a new streak shield!</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-5">
      <Header />

      <div className="card p-4 gradient-daily-scores flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔥</span>
          <div>
            <div className="text-2xl font-extrabold text-navy">{streakCount} day streak</div>
            <div className="text-xs text-navy/60">
              {streakCount === 0 ? 'Submit today to start your streak!' : `Submit by ${today.deadlineLabel}`}
            </div>
          </div>
        </div>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-white/70 text-navy">
          🛡️ {streakShields}/3
        </span>
      </div>

      <div className="card p-4 grid grid-cols-2 gap-3">
        <Field label="Your Name">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field label="Date">
          <input className="input bg-gray-50 text-navy/60" value={ptDateStringNow()} disabled />
        </Field>
      </div>

      <div className="card p-4 space-y-2">
        <Field label="What challenges did you face today?">
          <textarea className="input" rows={2} value={challenges} onChange={(e) => setChallenges(e.target.value)} placeholder="Describe any challenges…" />
        </Field>
      </div>

      <div className="card p-4 space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-navy/50">Did you earn your way today?</p>
          <p className="text-xs text-navy/50 mt-1">
            Earning your way means contributing to your environment by being the best version of yourself AND
            putting in genuine effort toward your goals and work.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEarnedWay(true)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold border ${earnedWay === true ? 'border-[#60a5fa] bg-[#bae6fd]/40 text-navy' : 'border-[#e5e5e5] text-navy/60'}`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setEarnedWay(false)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold border ${earnedWay === false ? 'border-[#60a5fa] bg-[#bae6fd]/40 text-navy' : 'border-[#e5e5e5] text-navy/60'}`}
          >
            No
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <Field label="How many volunteer hours did you put in today?" hint="Enter a number between 0–12">
          <input
            type="number"
            min={0}
            max={12}
            className="input"
            value={volunteerHours}
            onChange={(e) => setVolunteerHours(e.target.value)}
          />
        </Field>
      </div>

      <div>
        <h2 className="text-lg font-bold text-navy">Daily Ratings</h2>
        <p className="text-sm text-navy/50 mb-3">Most people live in the 4–7 range — that is normal. Where do you want to be?</p>
        <div className="space-y-3">
          {QUESTIONS.map((q) => (
            <ScoreSlider
              key={q.key}
              label={q.label}
              question={q.question}
              lowLabel={q.low}
              highLabel={q.high}
              value={sliders[q.key]}
              onChange={(v) => setSliders((prev) => ({ ...prev, [q.key]: v }))}
            />
          ))}
        </div>
      </div>

      <div className="card p-4 flex items-center justify-between gradient-daily-scores">
        <span className="text-sm font-semibold text-navy">Running total</span>
        <span className="text-2xl font-extrabold text-navy">{total} / 50</span>
      </div>

      <div className="card p-4 space-y-2">
        <Field label="What goals did you work on today?">
          <textarea className="input" rows={2} value={goalsWorkedOn} onChange={(e) => setGoalsWorkedOn(e.target.value)} placeholder="Describe the goals you worked on…" />
        </Field>
      </div>

      <div className="rounded-xl bg-[#eef2ff] border border-[#c7d2fe] p-3 text-sm text-navy/70">
        👀 <span className="font-semibold">Before you submit:</span> Double-check that your name and date are
        correct. Submissions cannot be edited after they are sent.
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="pressable w-full rounded-lg py-3 font-semibold text-navy gradient-daily-scores disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : "Submit Today's Score"}
      </button>
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        <span className="text-navy">Daily </span>
        <span className="text-[#3b82f6]">Scores</span>
      </h1>
      <p className="text-sm text-navy/50">Complete your daily check-in below.</p>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-navy/50 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-navy/40 mt-1">{hint}</p>}
    </div>
  );
}
