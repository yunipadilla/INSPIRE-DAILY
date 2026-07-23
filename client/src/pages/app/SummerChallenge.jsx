import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { calculateSummerPoints } from '../../lib/summerChallengePoints';
import { useAuth } from '../../context/AuthContext';
import { ptDateStringNow } from '../../lib/pacificTime';
import TileButton from '../../components/TileButton';
import SessionSelector from '../../components/SessionSelector';
import CircleCheck from '../../components/CircleCheck';

const SCREEN_TIME_OPTIONS = [
  { tier: 1, label: '≤ 1 hour', sublabel: '3 pts' },
  { tier: 2, label: '2 hours', sublabel: '2 pts' },
  { tier: 3, label: '3 hours', sublabel: '1 pt' },
  { tier: 4, label: '4+ hours', sublabel: '0 pts' },
];

const COLD_OPTIONS = [
  { value: 'plunge', label: 'Cold Plunge (1 min+)', sublabel: '1 pt' },
  { value: 'shower', label: 'Cold Shower (1 min+)', sublabel: '½ pt' },
  { value: 'none', label: 'Neither', sublabel: '0 pts' },
];

const DEFAULT_ENTRY = {
  sleepBedBefore10: false,
  sleep8h: false,
  hydration: false,
  exercise: false,
  screenTimeTier: null,
  mindfulnessSessions: 0,
  readingSessions: 0,
  dailyUpdateSent: false,
  nutrition: false,
  coldPlungeType: null,
};

function Countdown({ launchDate }) {
  const [msLeft, setMsLeft] = useState(() => new Date(`${launchDate}T00:00:00-07:00`).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setMsLeft(new Date(`${launchDate}T00:00:00-07:00`).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [launchDate]);

  const clamped = Math.max(0, msLeft);
  const days = Math.floor(clamped / 86400000);
  const hours = Math.floor((clamped % 86400000) / 3600000);
  const minutes = Math.floor((clamped % 3600000) / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);

  return (
    <div className="flex gap-3 justify-center">
      {[
        [days, 'Days'],
        [hours, 'Hrs'],
        [minutes, 'Min'],
        [seconds, 'Sec'],
      ].map(([value, label]) => (
        <div key={label} className="bg-white/90 rounded-xl px-4 py-3 text-center min-w-[64px]">
          <div className="text-2xl font-extrabold text-navy">{String(value).padStart(2, '0')}</div>
          <div className="text-[10px] uppercase text-navy/50">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        <span className="text-navy">Summer </span>
        <span className="text-[#d97706]">Challenge</span>
      </h1>
      <p className="text-sm text-navy/50">Log your daily activities and earn points for the group leaderboard.</p>
    </div>
  );
}

function CategoryCard({ title, points, subtitle, children }) {
  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-navy/60">
          {title} {points && <span className="text-[#d97706]">· {points}</span>}
        </h3>
        {subtitle && <p className="text-xs text-navy/40 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function SummerChallenge() {
  const { user } = useAuth();
  const [today, setToday] = useState(null);
  const [entry, setEntry] = useState(DEFAULT_ENTRY);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/summer-challenge/today').then(setToday);
  }, []);

  function update(field, value) {
    setEntry((e) => ({ ...e, [field]: value }));
  }

  const livePoints = calculateSummerPoints(entry);

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const data = await apiFetch('/summer-challenge', { method: 'POST', body: entry });
      setResult(data);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!today) return <div className="py-10 text-center text-navy/50">Loading…</div>;

  if (!today.isLaunched) {
    return (
      <div className="relative py-10">
        <div className="gradient-summer-challenge rounded-2xl p-8 text-center space-y-5">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-bold text-navy">Coming Soon</h1>
          <p className="text-navy/70 text-sm">The Summer Challenge launches soon. Get ready!</p>
          <Countdown launchDate={today.launchDate} />
        </div>
        <div className="mt-6 space-y-3 opacity-30 blur-sm pointer-events-none select-none">
          <div className="card p-4 h-16" />
          <div className="card p-4 h-16" />
          <div className="card p-4 h-16" />
        </div>
      </div>
    );
  }

  if (today.isSunday) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="text-4xl">☀️</div>
        <h1 className="text-xl font-bold text-navy">Today is Sunday — your rest day.</h1>
        <p className="text-navy/60 max-w-xs mx-auto">
          The Summer Challenge is not required today. Enjoy your day off!
        </p>
      </div>
    );
  }

  const alreadyDone = today.alreadySubmitted || Boolean(result);
  const totalPoints = result?.totalPoints ?? today.existing?.totalPoints;

  if (alreadyDone) {
    return (
      <div className="py-4 space-y-4">
        <Header />
        <div className="card p-6 text-center space-y-2">
          <div className="text-3xl">✅</div>
          <h1 className="text-lg font-bold text-navy">Summer Challenge points submitted for today!</h1>
          <p className="text-navy/60 text-sm">Total points: {totalPoints}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 space-y-4 pb-10">
      <Header />

      <div className="rounded-xl bg-[#fef3c7] border border-[#fde68a] p-3 text-sm text-[#92400e]">
        ⏰ <span className="font-bold">Submit by {today.deadlineLabel}.</span> Points only count if you submit before
        the deadline.
      </div>

      <div className="rounded-xl bg-[#fef3c7] border border-[#fde68a] p-3 text-sm text-[#92400e]">
        🛡️ <span className="font-bold">Honor Code:</span> This challenge runs on integrity. You are trusted to log
        honestly. If caught cheating, you will be removed from the challenge for that month.
      </div>

      <div className="card p-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-navy/50">Your Name</p>
          <p className="text-sm text-navy mt-1">{user?.fullName}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-navy/50">Date</p>
          <p className="text-sm text-navy mt-1">{ptDateStringNow()}</p>
        </div>
      </div>

      <div className="card p-4 flex items-center justify-between gradient-summer-challenge">
        <span className="text-sm font-semibold text-navy">Today's Points So Far</span>
        <span className="text-2xl font-extrabold text-navy">{livePoints}</span>
      </div>

      <CategoryCard title="Sleep" points="up to 2 pts">
        <CircleCheck label="In bed before 10pm" points="+1 pt" checked={entry.sleepBedBefore10} onChange={(v) => update('sleepBedBefore10', v)} />
        <CircleCheck label="8+ hours of sleep" points="+1 pt" checked={entry.sleep8h} onChange={(v) => update('sleep8h', v)} />
      </CategoryCard>

      <CategoryCard title="Hydration" points="1 pt">
        <CircleCheck
          label="1 gallon + electrolyte (non-athlete) · 2 gallons + electrolyte (athlete)"
          points="+1 pt"
          checked={entry.hydration}
          onChange={(v) => update('hydration', v)}
        />
      </CategoryCard>

      <CategoryCard title="Exercise" points="2 pts">
        <CircleCheck label="1 hour of exercise or more" points="+2 pts" checked={entry.exercise} onChange={(v) => update('exercise', v)} />
      </CategoryCard>

      <CategoryCard title="Screen Time Entertainment" points="up to 3 pts" subtitle="Social media, shows, movies, texting, etc.">
        <div className="grid grid-cols-2 gap-2">
          {SCREEN_TIME_OPTIONS.map((o) => (
            <TileButton
              key={o.tier}
              label={o.label}
              sublabel={`${o.sublabel}`}
              active={entry.screenTimeTier === o.tier}
              onClick={() => update('screenTimeTier', o.tier)}
            />
          ))}
        </div>
        <p className="text-xs text-navy/50">
          You must send a screenshot of your screen time in the WhatsApp group chat as proof or you will receive zero points for this category.
        </p>
      </CategoryCard>

      <CategoryCard title="Mindfulness" points="up to 3 pts" subtitle="1 pt per 5-min session · Yoga, meditation, breathwork, etc. · Max 3">
        <div className="flex items-center gap-3">
          <SessionSelector max={3} value={entry.mindfulnessSessions} onChange={(v) => update('mindfulnessSessions', v)} />
          <span className="text-sm text-navy/50">sessions</span>
        </div>
      </CategoryCard>

      <CategoryCard title="Reading" points="1 pt per 30 min" subtitle="How many 30-minute reading sessions today?">
        <div className="flex items-center gap-3">
          <SessionSelector max={4} value={entry.readingSessions} onChange={(v) => update('readingSessions', v)} />
          <span className="text-sm text-navy/50">× 30 min</span>
        </div>
      </CategoryCard>

      <CategoryCard title="Daily Scores" points="+4 pts" subtitle="Send by 11:59 PM">
        <CircleCheck
          label="Sent your daily update including highlights, lowlights, and 3 Summer Skills"
          points="+4 pts"
          checked={entry.dailyUpdateSent}
          onChange={(v) => update('dailyUpdateSent', v)}
        />
      </CategoryCard>

      <CategoryCard title="Nutrition" points="1 pt">
        <CircleCheck label="Self-assessed intuitive eating" points="+1 pt" checked={entry.nutrition} onChange={(v) => update('nutrition', v)} />
      </CategoryCard>

      <CategoryCard title="Cold Plunge / Cold Shower" points="up to 1 pt">
        <div className="flex gap-2">
          {COLD_OPTIONS.map((o) => (
            <TileButton
              key={o.value}
              label={o.label}
              sublabel={o.sublabel}
              active={entry.coldPlungeType === o.value}
              onClick={() => update('coldPlungeType', o.value)}
            />
          ))}
        </div>
      </CategoryCard>

      <div className="rounded-xl bg-[#eef2ff] border border-[#c7d2fe] p-3 text-sm text-navy/70">
        👀 <span className="font-semibold">Before you submit:</span> Double-check that your name and date are
        correct. Submissions cannot be edited after they are sent.
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn-bubble w-full py-3 text-navy gradient-summer-challenge"
      >
        {submitting ? 'Submitting…' : `Submit My Points · ${livePoints} pts`}
      </button>
    </div>
  );
}
