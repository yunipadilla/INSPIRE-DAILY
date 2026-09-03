import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { calculateSummerPoints } from '../../lib/summerChallengePoints';
import { useAuth } from '../../context/AuthContext';
import { formatDateLabel, formatFullDateLabel } from '../../lib/pacificTime';
import TileButton from '../../components/TileButton';
import SessionSelector from '../../components/SessionSelector';
import CircleCheck from '../../components/CircleCheck';
import SectionHeader from '../../components/SectionHeader';

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

const MEDAL = ['🥇', '🥈', '🥉'];

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
        <div key={label} className="bg-surface-elevated/90 rounded-xl px-4 py-3 text-center min-w-[64px]">
          <div className="text-2xl font-extrabold text-navy">{String(value).padStart(2, '0')}</div>
          <div className="text-[10px] uppercase font-bold text-ink-muted">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        <span className="text-navy">Inspire </span>
        <span className="text-warning">Challenge</span>
      </h1>
      <p className="text-sm text-ink-secondary">Log your daily activities and earn points for the group leaderboard.</p>
    </div>
  );
}

/** Same server-authoritative window as Daily Scores — see
 * ReflectionDateChooser in pages/app/DailyScores.jsx for the sibling
 * component; this one uses "logging activity for" phrasing instead of
 * "reflecting on," matching how Part 5 frames Challenge logging. */
function ActivityDateChooser({ data, selected, onSelect }) {
  const yesterdayEligible = Boolean(data.yesterday?.eligible);
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-muted px-1">Activity Date</p>
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
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelect('today')}
          aria-pressed={selected === 'today' || !yesterdayEligible}
          className={`flex-1 rounded-xl py-2.5 px-2 text-left pressable transition-colors ${
            selected === 'today' || !yesterdayEligible ? 'bg-warning text-onbrand shadow-sm' : 'bg-surface-soft text-navy'
          }`}
        >
          <div className="text-sm font-bold">Today — {formatDateLabel(data.today.date)}</div>
        </button>
      </div>
      {!yesterdayEligible && data.yesterday?.message && (
        <p className="text-xs font-semibold text-ink-muted px-1">Yesterday's submission window closed at 12:00 PM PT.</p>
      )}
    </div>
  );
}

function CategoryCard({ title, points, subtitle, children }) {
  return (
    <div className="card p-4 space-y-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">
          {title} {points && <span className="text-warning font-bold">· {points}</span>}
        </h3>
        {subtitle && <p className="text-xs text-ink-secondary mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Leaderboard({ entries }) {
  if (!entries) return null;
  return (
    <section>
      <SectionHeader icon="🏆" iconBg="rgb(var(--color-warning) / 0.16)" title="Monthly Winners" />
      <div className="card divide-y divide-border/6 overflow-hidden">
        {entries.length === 0 && <p className="p-4 text-sm text-ink-secondary">No points logged yet this month.</p>}
        {entries.map((e, i) => (
          <div key={e.id} className={`flex items-center gap-3 p-3 ${e.isCurrentUser ? 'bg-warning/10' : ''}`}>
            <span className="w-6 text-base text-center">
              {MEDAL[i] || <span className="text-sm font-bold text-ink-secondary">{e.rank}</span>}
            </span>
            <div className="w-9 h-9 rounded-full gradient-inspire-challenge flex items-center justify-center text-xs font-bold text-navy overflow-hidden flex-shrink-0">
              {e.profilePhotoUrl ? (
                <img src={e.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                `${e.firstName?.[0] || ''}${e.lastInitial}`
              )}
            </div>
            <span className="flex-1 text-sm font-medium text-navy">
              {e.firstName} {e.lastInitial}.
            </span>
            <span className="text-sm font-extrabold text-navy">{e.score} pts</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function InspireChallenge() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('today'); // 'today' | 'yesterday'
  const [leaderboard, setLeaderboard] = useState(null);
  const [entry, setEntry] = useState(DEFAULT_ENTRY);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/summer-challenge/today').then((res) => {
      setData(res);
      setSelected(res.window?.defaultDate === res.window?.yesterday ? 'yesterday' : 'today');
    });
    apiFetch('/summer-challenge/leaderboard').then((d) => setLeaderboard(d.entries));
  }, []);

  function update(field, value) {
    setEntry((e) => ({ ...e, [field]: value }));
  }

  const livePoints = calculateSummerPoints(entry);

  if (!data) return <div className="py-10 text-center text-ink-secondary">Loading…</div>;

  if (!data.isLaunched) {
    return (
      <div className="relative py-10">
        <div className="gradient-inspire-challenge rounded-2xl p-8 text-center space-y-5">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-bold text-navy">Coming Soon</h1>
          <p className="text-ink-secondary text-sm font-medium">The Inspire Challenge launches soon. Get ready!</p>
          <Countdown launchDate={data.launchDate} />
        </div>
        <div className="mt-6 space-y-3 opacity-30 blur-sm pointer-events-none select-none">
          <div className="card p-4 h-16" />
          <div className="card p-4 h-16" />
          <div className="card p-4 h-16" />
        </div>
      </div>
    );
  }

  if (data.today.isSunday) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="text-4xl">☀️</div>
        <h1 className="text-xl font-bold text-navy">Today is Sunday — your rest day.</h1>
        <p className="text-ink-secondary max-w-xs mx-auto">
          The Inspire Challenge is not required today. Enjoy your day off!
        </p>
      </div>
    );
  }

  const isYesterday = selected === 'yesterday' && data.yesterday?.eligible;
  const activeDate = isYesterday ? data.yesterday.date : data.today.date;
  const activeDay = isYesterday ? data.yesterday : data.today;
  const alreadyDone = (result && result.date === activeDate) || activeDay.alreadySubmitted;
  const totalPoints = result?.date === activeDate ? result.totalPoints : activeDay.existing?.totalPoints;

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const submitted = await apiFetch('/summer-challenge', { method: 'POST', body: { ...entry, date: activeDate } });
      setResult(submitted);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyDone) {
    return (
      <div className="py-4 space-y-4">
        <Header />
        <ActivityDateChooser data={data} selected={selected} onSelect={setSelected} />
        <div className="card p-6 text-center space-y-2">
          <div className="text-3xl">✅</div>
          <h1 className="text-lg font-bold text-navy">Inspire Challenge points submitted for {formatDateLabel(activeDate)}!</h1>
          <p className="text-ink-secondary text-sm">Total points: {totalPoints}</p>
        </div>
        {data.volunteerHoursThisMonth > 0 && (
          <div className="card p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-navy">Volunteer hours this month</span>
            <span className="text-lg font-extrabold text-navy">{data.volunteerHoursThisMonth}</span>
          </div>
        )}
        <Leaderboard entries={leaderboard} />
      </div>
    );
  }

  return (
    <div className="py-4 space-y-4 pb-10">
      <Header />
      <ActivityDateChooser data={data} selected={selected} onSelect={setSelected} />

      <div className="rounded-xl bg-surface-soft px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Logging activity for</span>
        <span className="text-sm font-bold text-navy">{formatFullDateLabel(activeDate)}</span>
      </div>

      <div className="rounded-xl bg-warning/15 border border-warning/30 p-3 text-sm text-navy">
        ⏰ <span className="font-bold text-warning">Submit by {data.window.cutoffLabel} the day after.</span> Points only count if you
        submit before the deadline.
      </div>

      <div className="rounded-xl bg-warning/15 border border-warning/30 p-3 text-sm text-navy">
        🛡️ <span className="font-bold text-warning">Honor Code:</span> This challenge runs on integrity. You are
        trusted to log honestly. If caught cheating, you will be removed from the challenge for that month.
      </div>

      <div className="card p-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Your Name</p>
          <p className="text-sm text-navy mt-1 font-medium">{user?.fullName}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Date</p>
          <p className="text-sm text-navy mt-1 font-medium">{formatDateLabel(activeDate)}</p>
        </div>
      </div>

      <div className="card p-4 flex items-center justify-between gradient-inspire-challenge">
        <span className="text-sm font-semibold text-navy">Points So Far</span>
        <span className="text-2xl font-extrabold text-navy">{livePoints}</span>
      </div>

      {data.volunteerHoursThisMonth > 0 && (
        <div className="card p-3 flex items-center justify-between text-sm">
          <span className="text-ink-secondary">Volunteer hours logged this month (via Daily Scores)</span>
          <span className="font-bold text-navy">{data.volunteerHoursThisMonth}</span>
        </div>
      )}

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
        <p className="text-xs text-ink-secondary">
          You must send a screenshot of your screen time in the WhatsApp group chat as proof or you will receive zero points for this category.
        </p>
      </CategoryCard>

      <CategoryCard title="Mindfulness" points="up to 3 pts" subtitle="1 pt per 5-min session · Yoga, meditation, breathwork, etc. · Max 3">
        <div className="flex items-center gap-3">
          <SessionSelector max={3} value={entry.mindfulnessSessions} onChange={(v) => update('mindfulnessSessions', v)} />
          <span className="text-sm text-ink-secondary">sessions</span>
        </div>
      </CategoryCard>

      <CategoryCard title="Reading" points="1 pt per 30 min" subtitle="How many 30-minute reading sessions today?">
        <div className="flex items-center gap-3">
          <SessionSelector max={4} value={entry.readingSessions} onChange={(v) => update('readingSessions', v)} />
          <span className="text-sm text-ink-secondary">× 30 min</span>
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

      <div className="rounded-xl bg-primary/10 border border-primary/25 p-3 text-sm text-navy">
        👀 <span className="font-semibold">Before you submit:</span> Double-check that your name and date are
        correct. Submissions cannot be edited after they are sent.
      </div>

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="btn-bubble w-full py-3 text-navy gradient-inspire-challenge"
      >
        {submitting ? 'Submitting…' : `Submit My Points · ${livePoints} pts`}
      </button>

      <Leaderboard entries={leaderboard} />
    </div>
  );
}
