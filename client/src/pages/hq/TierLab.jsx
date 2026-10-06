import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import DashboardCard from '../../components/ui/DashboardCard';
import DataTable from '../../components/ui/DataTable';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Alert from '../../components/ui/Alert';
import TierChip from '../../components/hq/TierChip';
import { pct, num, monthLabel } from '../../lib/tierFormat';

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function PreLaunchBanner({ meta, rules }) {
  return (
    <div className="card p-4 sm:p-5" style={{ borderLeft: '4px solid rgb(var(--color-warning))' }}>
      <div className="flex items-start gap-3">
        <FlaskConical size={22} className="flex-shrink-0 mt-0.5 text-navy" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-extrabold tracking-wide text-navy">{meta.bannerTitle}</p>
          <p className="text-sm text-ink-primary">Internal testing only. Participants cannot see this.</p>
          <p className="text-xs text-ink-secondary">
            Participant visibility: <strong>{meta.participantVisibility ? 'ON' : 'OFF'}</strong> · Planned participant launch:{' '}
            <strong>{meta.plannedLaunch}</strong> · All results below are <strong>projected</strong>, never earned or awarded.
            Nothing activates automatically; launch needs a separate, explicit decision.
          </p>
          <p className="text-xs text-ink-muted">{rules.label} ({rules.status}) — thresholds can change before launch.</p>
        </div>
      </div>
    </div>
  );
}

function RuleCards({ rules }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Draft rules V1</h2>
        <span className="text-xs text-ink-muted">Both requirements must be met · best tier checked first</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rules.tiers.map((t) => (
          <div key={t.tier} className="card p-4">
            <TierChip tier={t.tier} label={`TIER ${t.tier}`} />
            <p className="mt-3 text-2xl font-extrabold text-navy">{Math.round(t.minCompletion * 100)}% <span className="text-sm font-semibold text-ink-secondary">completion</span></p>
            <p className="text-2xl font-extrabold text-navy">{t.minChallengeAvg} <span className="text-sm font-semibold text-ink-secondary">avg Challenge pts</span></p>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-muted mt-2">
        Completion = completed required entries ÷ eligible non-Sunday days. Challenge average = Challenge points ÷ eligible non-Sunday
        days (a day with no Challenge entry counts as 0). Below Tier 3: “Building Toward Tier 3”. Fewer than {rules.minEligibleDays} verifiable days: “Insufficient Data”.
      </p>
    </div>
  );
}

const DIST_ROWS = [
  ['tier1', 'Projected Tier 1', '--color-yellow'], ['tier2', 'Projected Tier 2', '--color-blue'], ['tier3', 'Projected Tier 3', '--color-peach'],
  ['building', 'Building Toward Tier 3', '--color-lavender'], ['insufficient', 'Insufficient Data', '--color-text-muted'],
];

function Distribution({ dist }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {DIST_ROWS.map(([k, label, c]) => (
        <DashboardCard key={k} label={label} value={dist[k]} colorVar={c} />
      ))}
    </div>
  );
}

function Simulator({ rules, month }) {
  const initial = () => rules.tiers.map((t) => ({ tier: t.tier, minCompletionPct: String(Math.round(t.minCompletion * 100)), minChallengeAvg: String(t.minChallengeAvg) }));
  const [rows, setRows] = useState(initial);
  const [sim, setSim] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const setField = (i, f, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [f]: v } : r)));

  async function run(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const tiers = rows.map((r) => ({ tier: r.tier, minCompletionPct: Number(r.minCompletionPct), minChallengeAvg: Number(r.minChallengeAvg) }));
      if (tiers.some((t) => !Number.isFinite(t.minCompletionPct) || !Number.isFinite(t.minChallengeAvg))) throw new Error('Enter a number in every field.');
      setSim(await apiFetch(`/hq/tier-lab/simulate?month=${month}`, { method: 'POST', body: { tiers } }));
    } catch (ex) {
      setErr(ex.data?.error || ex.message);
    } finally { setBusy(false); }
  }

  const Col = ({ title, dist, accent }) => (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-navy">
        {DIST_ROWS.map(([k, label]) => (
          <li key={k} className="flex justify-between gap-4"><span>{label}</span><strong style={accent}>{dist[k]}</strong></li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Rule simulator</h2>
        <p className="text-xs text-ink-secondary">Preview only — try different thresholds against real data. Nothing here changes the saved Draft V1 rules.</p>
      </div>
      <form onSubmit={run} className="card p-4 space-y-3">
        <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-2 items-center text-sm">
          <span />
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Completion %</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Challenge avg</span>
          {rows.map((r, i) => (
            <div key={r.tier} className="contents">
              <span className="font-bold text-navy">Tier {r.tier}</span>
              <input aria-label={`Tier ${r.tier} completion percent`} className="input-bubble" inputMode="decimal" value={r.minCompletionPct} onChange={(e) => setField(i, 'minCompletionPct', e.target.value)} />
              <input aria-label={`Tier ${r.tier} Challenge average`} className="input-bubble" inputMode="decimal" value={r.minChallengeAvg} onChange={(e) => setField(i, 'minChallengeAvg', e.target.value)} />
            </div>
          ))}
        </div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="btn-bubble gradient-rainbow text-white px-5 py-2.5 min-h-[44px]">{busy ? 'Calculating…' : 'Preview distribution'}</button>
          <button type="button" className="px-4 py-2.5 min-h-[44px] text-sm font-semibold text-link" onClick={() => { setRows(initial()); setSim(null); setErr(''); }}>Reset to Draft V1</button>
        </div>
      </form>
      {sim && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Col title="Current draft (saved)" dist={sim.draft.distribution} />
            <Col title="Preview (not saved)" dist={sim.preview.distribution} />
          </div>
          {sim.changes.length > 0 ? (
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">Who would change ({sim.changes.length})</p>
              <ul className="text-sm text-navy space-y-1">
                {sim.changes.map((c) => <li key={c.id}><Link className="text-link font-semibold" to={`/hq/tier-lab/${c.id}`}>{c.name}</Link>: {c.from} → {c.to}</li>)}
              </ul>
            </div>
          ) : <p className="text-sm text-ink-secondary">No participant’s projected result changes with these thresholds.</p>}
        </>
      )}
    </section>
  );
}

const TREND = { improving: '↑ improving', declining: '↓ declining', steady: '→ steady' };

export default function TierLab() {
  const [month, setMonth] = useState(currentMonthValue());
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null); setError(false);
    apiFetch(`/hq/tier-lab?month=${month}`).then(setData).catch(() => setError(true));
  }, [month]);

  if (error) return <ErrorState description="Couldn't load Tier Lab." />;
  if (!data) return <Skeleton height="300px" />;

  const columns = [
    { key: 'name', label: 'Participant', render: (r) => <span className="font-semibold">{r.name}</span> },
    { key: 'tier', label: 'Projected tier', render: (r) => <TierChip tier={r.projectedTier} status={r.status} label={r.projectedLabel === 'Building Toward Tier 3' ? 'Building Toward Tier 3' : undefined} /> },
    { key: 'completion', label: 'Completion', render: (r) => pct(r.completionRate) },
    { key: 'avg', label: 'Challenge avg', render: (r) => num(r.challengeAverage) },
    { key: 'pts', label: 'Challenge pts', render: (r) => num(r.challengePoints, 1) },
    { key: 'days', label: 'Eligible days', render: (r) => (r.challengeDays !== r.eligibleDays ? `${r.eligibleDays} (Challenge ${r.challengeDays})` : r.eligibleDays) },
    { key: 'done', label: 'Completed', render: (r) => r.completedEntries },
    { key: 'months', label: 'Usable months', render: (r) => r.usableMonths },
    {
      key: 'status', label: 'Trend / data',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
          {r.completionTrend ? TREND[r.completionTrend.direction] : '—'}
          {(r.uncertain || r.dataStatus === 'partial') && (
            <span title={r.uncertain ? 'Tier could differ if unverifiable historical days were misses' : 'Some historical days could not be verified'}>
              <AlertTriangle size={14} style={{ color: `rgb(var(${r.uncertain ? '--color-danger' : '--color-warning'}))` }} aria-label={r.uncertain ? 'Uncertain result' : 'Partial data'} />
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PageTitle>Tier Lab</PageTitle>
        <label className="text-xs text-ink-secondary flex items-center gap-2">
          Window ends
          <input type="month" className="input-bubble w-auto text-sm" value={month} max={currentMonthValue()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
      </div>

      <PreLaunchBanner meta={data.meta} rules={data.rules} />
      <RuleCards rules={data.rules} />

      <div>
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Projected distribution</h2>
          <span className="text-xs text-ink-muted">
            {data.window.months.map(monthLabel).join(' → ')} · counting closed days through {data.window.evaluationEnd}
          </span>
        </div>
        <Distribution dist={data.distribution} />
      </div>

      <Simulator rules={data.rules} month={month} />

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Participants</h2>
        <Alert variant="info">
          Analytical only — no verdicts about honesty. ⚠ marks results where migrated history is incomplete; open a participant for the
          month-by-month detail and the worst-case view.
        </Alert>
        {/* Phones get DataTable's stacked cards; from sm up the table keeps a readable width and scrolls sideways. */}
        <div className="overflow-x-auto pb-1">
          <div className="sm:min-w-[1000px]">
            <DataTable columns={columns} rows={data.participants} getRowHref={(r) => `/hq/tier-lab/${r.id}`} />
          </div>
        </div>
      </section>
    </div>
  );
}
