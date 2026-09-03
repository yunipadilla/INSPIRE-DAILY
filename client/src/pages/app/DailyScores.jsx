import { useEffect, useState } from 'react';
import ScoreSlider from '../../components/ScoreSlider';
import GoalCelebration from '../../components/goals/GoalCelebration';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { formatDateLabel, formatFullDateLabel } from '../../lib/pacificTime';

/** Contextual question text — the server never dictates wording, only
 * eligibility; "today" vs "yesterday" phrasing lives here, driven by which
 * day the participant selected. Sleep intentionally reads the same either
 * way ("last night") — forcing "yesterday" grammar onto it reads awkwardly
 * and the meaning stays clear regardless of which day is selected. */
const QUESTIONS = [
  {
    key: 'bestSelf',
    label: 'Best Self',
    question: (y) => (y ? 'How well did you embody your Best Self yesterday?' : 'How close were you to your best self today?'),
    low: 'Worst Self',
    high: 'Best Self',
  },
  {
    key: 'ceoMindset',
    label: 'CEO Mindset',
    question: (y) => (y ? 'How well did you practice the CEO Mindset yesterday?' : 'How proactive and self-starting were you today?'),
    low: 'Reactive all day',
    high: 'Fully in control',
  },
  {
    key: 'grit',
    label: 'Grit',
    question: (y) => (y ? 'How much grit did you show yesterday?' : 'How well did you push through hard or boring things?'),
    low: 'Gave up immediately',
    high: 'Stayed with it all day',
  },
  {
    key: 'happiness',
    label: 'Happiness',
    question: (y) => (y ? 'How happy did you feel yesterday?' : 'How would you rate your mood and wellbeing today?'),
    low: 'Really struggling',
    high: 'Thriving',
  },
  {
    key: 'sleep',
    label: 'Sleep',
    question: () => 'How was your sleep last night?',
    low: 'Barely slept',
    high: 'Best sleep ever',
  },
];

const DEFAULT_SLIDERS = Object.fromEntries(QUESTIONS.map((q) => [q.key, 5]));

export default function DailyScores() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('today'); // 'today' | 'yesterday'
  const [displayName, setDisplayName] = useState('');
  const [challenges, setChallenges] = useState('');
  const [earnedWay, setEarnedWay] = useState(null);
  const [volunteerHours, setVolunteerHours] = useState('');
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS);
  const [goalsWorkedOn, setGoalsWorkedOn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    apiFetch('/daily-scores/today').then((res) => {
      setData(res);
      // The server's defaultDate says which day to preselect (yesterday
      // while its window is still open, otherwise today) — the client never
      // computes this itself from wall-clock time.
      setSelected(res.window.defaultDate === res.window.yesterday ? 'yesterday' : 'today');
    });
    if (user) setDisplayName(user.fullName);
  }, [user]);

  if (!data) {
    return <div className="py-10 text-center text-ink-secondary">Loading…</div>;
  }

  if (data.today.isSunday) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="text-4xl">☀️</div>
        <h1 className="text-xl font-bold text-navy">Today is Sunday — your rest day.</h1>
        <p className="text-ink-secondary max-w-xs mx-auto">
          Daily Scores are not required today. Enjoy your day off and come back stronger tomorrow.
        </p>
      </div>
    );
  }

  const isYesterday = selected === 'yesterday' && data.yesterday?.eligible;
  const activeDate = isYesterday ? data.yesterday.date : data.today.date;
  const activeDay = isYesterday ? data.yesterday : data.today;
  const alreadyDone = (result && result.date === activeDate) || activeDay.alreadySubmitted;
  const streakCount = result?.streakCount ?? data.streakCount;
  const streakShields = result?.streakShields ?? data.streakShields;

  async function handleSubmit() {
    setError('');
    if (earnedWay === null) {
      setError(`Please answer whether you earned your way ${isYesterday ? 'yesterday' : 'today'}.`);
      return;
    }
    setSubmitting(true);
    try {
      const submitted = await apiFetch('/daily-scores', {
        method: 'POST',
        body: {
          date: activeDate,
          displayName,
          challenges,
          earnedWay,
          volunteerHours: Number(volunteerHours) || 0,
          goalsWorkedOn,
          ...sliders,
        },
      });
      setResult(submitted);
      setShowCelebration(true);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyDone) {
    const existing = result?.date === activeDate ? null : activeDay.existing;
    return (
      <div className="py-4 space-y-4">
        <Header />
        <ReflectionDateChooser data={data} selected={selected} onSelect={setSelected} />
        <div className="card p-7 text-center space-y-2.5 gradient-daily-scores">
          <div className="text-4xl">✅</div>
          <h1 className="text-lg font-bold text-navy">
            Daily Scores submitted for {formatDateLabel(activeDate)}!
          </h1>
          <p className="text-ink-secondary text-sm">
            Total score: {result?.date === activeDate ? result.totalScore : existing?.totalScore} / 50
          </p>
          {result?.date === activeDate && result?.earnedShield && (
            <p className="text-sm font-semibold text-success">🛡️ You earned a new streak shield!</p>
          )}
        </div>
        {showCelebration && result?.date === activeDate && (
          <GoalCelebration
            theme="dailyScores"
            message={
              result?.earnedShield
                ? `${streakCount}-day streak — you earned a shield! 🛡️`
                : `Daily Scores submitted! ${streakCount}-day streak 🔥`
            }
            onClose={() => setShowCelebration(false)}
          />
        )}
      </div>
    );
  }

  const dayWord = isYesterday ? 'yesterday' : 'today';

  return (
    <div className="py-4 space-y-5">
      <Header />
      <ReflectionDateChooser data={data} selected={selected} onSelect={setSelected} />

      <div className="rounded-xl bg-surface-soft px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Reflecting on</span>
        <span className="text-sm font-bold text-navy">{formatFullDateLabel(activeDate)}</span>
      </div>

      <div className="card p-5 gradient-daily-scores flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔥</span>
          <div>
            <div className="text-2xl font-extrabold text-navy">{streakCount} day streak</div>
            <div className="text-xs text-ink-secondary font-medium">
              {streakCount === 0 ? `Submit ${dayWord} to start your streak!` : `Submit by ${data.window.cutoffLabel} the day after.`}
            </div>
          </div>
        </div>
        <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-surface-elevated/80 text-navy">
          🛡️ {streakShields}/3
        </span>
      </div>

      <div className="card p-5 grid grid-cols-2 gap-4">
        <Field label="Your Name">
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field label="Date">
          <div className="input bg-surface-soft text-ink-secondary flex items-center justify-between">
            <span>{formatDateLabel(activeDate)}</span>
            {isYesterday && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-warning/25 text-navy">
                Yesterday
              </span>
            )}
          </div>
        </Field>
      </div>

      <div className="card p-6 space-y-2">
        <Field label={`What challenges did you face ${dayWord}?`}>
          <textarea className="input" rows={2} value={challenges} onChange={(e) => setChallenges(e.target.value)} placeholder="Describe any challenges…" />
        </Field>
      </div>

      <div className="card p-6 space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Did you earn your way {dayWord}?</p>
          <p className="text-xs text-ink-secondary mt-1">
            Earning your way means contributing to your environment by being the best version of yourself AND
            putting in genuine effort toward your goals and work.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEarnedWay(true)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold border ${earnedWay === true ? 'border-blue bg-blue/15 text-navy' : 'border-border/25 text-ink-secondary'}`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setEarnedWay(false)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold border ${earnedWay === false ? 'border-blue bg-blue/15 text-navy' : 'border-border/25 text-ink-secondary'}`}
          >
            No
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-2">
        <Field label={`How many volunteer hours did you ${isYesterday ? 'complete' : 'put in'} ${dayWord}?`} hint="Enter a number between 0–12">
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
        <p className="text-sm text-ink-secondary mb-3">Most people live in the 4–7 range — that is normal. Where do you want to be?</p>
        <div className="space-y-3">
          {QUESTIONS.map((q) => (
            <ScoreSlider
              key={q.key}
              label={q.label}
              question={q.question(isYesterday)}
              lowLabel={q.low}
              highLabel={q.high}
              value={sliders[q.key]}
              onChange={(v) => setSliders((prev) => ({ ...prev, [q.key]: v }))}
            />
          ))}
        </div>
      </div>

      <div className="card p-6 space-y-2">
        <Field label={`What goals did you work on ${dayWord}?`}>
          <textarea className="input" rows={2} value={goalsWorkedOn} onChange={(e) => setGoalsWorkedOn(e.target.value)} placeholder="Describe the goals you worked on…" />
        </Field>
      </div>

      <div className="rounded-xl bg-primary/10 border border-primary/25 p-3.5 text-sm text-navy">
        👀 <span className="font-semibold">Before you submit:</span> Double-check that your name and date are
        correct. Submissions cannot be edited after they are sent.
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn-bubble w-full py-3 text-navy gradient-daily-scores"
      >
        {submitting ? 'Submitting…' : `Submit ${isYesterday ? "Yesterday's" : "Today's"} Score`}
      </button>

      {showCelebration && (
        <GoalCelebration
          theme="dailyScores"
          message={
            result?.earnedShield
              ? `${streakCount}-day streak — you earned a shield! 🛡️`
              : `Daily Scores submitted! ${streakCount}-day streak 🔥`
          }
          onClose={() => setShowCelebration(false)}
        />
      )}
    </div>
  );
}

/**
 * The Reflection Date chooser — always shows Today; shows Yesterday as a
 * live option while eligible, or a clearly-labeled locked state once its
 * window has closed (never a silent disappearance the participant has to
 * guess about).
 */
function ReflectionDateChooser({ data, selected, onSelect }) {
  const yesterdayEligible = Boolean(data.yesterday?.eligible);
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-muted px-1">Reflection Date</p>
      <div className="flex gap-2" role="group" aria-label="Which day is this entry for?">
        {yesterdayEligible && (
          <button
            type="button"
            onClick={() => onSelect('yesterday')}
            aria-pressed={selected === 'yesterday'}
            className={`flex-1 rounded-xl py-2.5 px-2 text-left pressable transition-colors ${
              selected === 'yesterday' ? 'bg-warning/90 text-onbrand shadow-sm' : 'bg-surface-soft text-navy'
            }`}
          >
            <div className="text-sm font-bold">Yesterday — {formatDateLabel(data.yesterday.date)}</div>
            <div className={`text-[11px] font-medium ${selected === 'yesterday' ? 'text-onbrand/85' : 'text-ink-muted'}`}>
              Finish yesterday's reflection before noon.
            </div>
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelect('today')}
          aria-pressed={selected === 'today' || !yesterdayEligible}
          className={`flex-1 rounded-xl py-2.5 px-2 text-left pressable transition-colors ${
            selected === 'today' || !yesterdayEligible ? 'bg-blue text-onbrand shadow-sm' : 'bg-surface-soft text-navy'
          }`}
        >
          <div className="text-sm font-bold">Today — {formatDateLabel(data.today.date)}</div>
        </button>
      </div>
      {!yesterdayEligible && data.yesterday?.message && (
        <p className="text-xs font-semibold text-ink-muted px-1">
          Yesterday's reflection window closed at 12:00 PM.
        </p>
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        <span className="text-navy">Daily </span>
        <span className="text-blue">Scores</span>
      </h1>
      <p className="text-sm text-ink-secondary italic">A quiet moment to reflect on your day.</p>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-ink-muted mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-secondary mt-1">{hint}</p>}
    </div>
  );
}
