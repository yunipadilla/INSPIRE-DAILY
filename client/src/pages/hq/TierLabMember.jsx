import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import DashboardCard from '../../components/ui/DashboardCard';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import Alert from '../../components/ui/Alert';
import TierChip from '../../components/hq/TierChip';
import { pct, num, monthLabel } from '../../lib/tierFormat';

const STATUS_TEXT = {
  complete: 'Complete', partial: 'Partial history', insufficient_history: 'Insufficient historical detail',
  not_eligible: 'Not yet eligible',
};

/** Which measures are left out of a month, in words. */
function statusText(m) {
  if (m.status === 'partial_history') {
    return m.completionStatus === 'excluded' ? 'Completion: insufficient historical detail' : 'Challenge: insufficient historical detail';
  }
  return STATUS_TEXT[m.status];
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TierLabMember() {
  const { id } = useParams();
  const [month, setMonth] = useState(currentMonthValue());
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null); setError(false);
    apiFetch(`/hq/tier-lab/members/${id}?month=${month}`).then(setData).catch(() => setError(true));
  }, [id, month]);

  if (error) return <ErrorState description="Couldn't load this participant's Tier Lab detail." />;
  if (!data) return <Skeleton height="300px" />;

  const { result: r, participant: p, rules } = data;
  const rowsShown = r.monthlyBreakdown.filter((m) => m.status !== 'not_eligible');
  const target = r.explanation?.lines?.[0]?.targetTier;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link to="/hq/tier-lab" className="text-xs font-semibold text-link">← Tier Lab</Link>
          <PageTitle>{p.name}</PageTitle>
        </div>
        <label className="text-xs text-ink-secondary flex items-center gap-2">
          Window ends
          <input type="month" className="input-bubble w-auto text-sm" value={month} max={currentMonthValue()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
      </div>

      <Alert variant="warning">
        <strong>{data.meta.bannerTitle}</strong> — internal testing only; participants cannot see this. Results are <strong>projected</strong>,
        under {rules.label}. Planned participant launch: {data.meta.plannedLaunch}.
      </Alert>

      <div className="card p-5 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Projected tier</p>
        <TierChip tier={r.projectedTier} status={r.status} size="lg" />
        {r.uncertain && (
          <p className="text-sm text-danger">
            Uncertain: if the unverifiable historical days were misses, this would be{' '}
            {r.worstCase.projectedTier ? `Tier ${r.worstCase.projectedTier}` : 'Building Toward Tier 3'}.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardCard label="Completion" value={pct(r.completionRate)} colorVar="--color-primary" hint={r.worstCase.completionRate != null && r.uncertain ? `worst case ${pct(r.worstCase.completionRate)}` : undefined} />
        <DashboardCard label="Challenge avg" value={num(r.challengeAverage)} colorVar="--color-blue" hint="points ÷ eligible days" />
        <DashboardCard label="Challenge points" value={num(r.challengePoints, 1)} colorVar="--color-yellow" />
        <DashboardCard label="Usable months" value={r.usableMonths} colorVar="--color-lavender" />
        <DashboardCard label="Completed entries" value={r.completedEntries} colorVar="--color-success" />
        <DashboardCard label="Eligible days" value={r.eligibleDays} colorVar="--color-mint" hint="non-Sunday, verifiable (completion)" />
        <DashboardCard label="Challenge days" value={r.challengeDays} colorVar="--color-blue" hint="denominator for the Challenge average" />
        <DashboardCard label="Eligible since" value={p.eligibleStart} colorVar="--color-peach" />
        <DashboardCard label="Rules" value={r.ruleVersion.toUpperCase()} colorVar="--color-text-muted" hint={rules.label} />
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Why this tier?</h2>
        {r.status === 'insufficient' ? (
          <p className="text-sm text-ink-primary">{r.insufficientReason}</p>
        ) : (
          <>
            <p className="text-sm text-ink-primary">{r.explanation.summary}</p>
            {r.explanation.lines.length > 0 && (
              <div className="text-sm">
                <p className="text-xs text-ink-muted mb-1">Requirements for {target === 3 && !r.projectedTier ? 'Tier 3' : `Tier ${target}`}:</p>
                <ul className="space-y-1">
                  {r.explanation.lines.map((l) => (
                    <li key={l.metric} className="flex items-center gap-2 text-navy">
                      {l.met ? <Check size={16} style={{ color: 'rgb(var(--color-success))' }} aria-label="met" /> : <X size={16} style={{ color: 'rgb(var(--color-danger))' }} aria-label="not met" />}
                      {l.metric === 'completion'
                        ? `Completion ${pct(l.actual)} (needs ${Math.round(l.required * 100)}%)`
                        : `Challenge average ${num(l.actual)} (needs ${l.required})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {r.caveats.length > 0 && (
          <ul className="text-xs text-ink-secondary list-disc pl-5 space-y-0.5">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        )}
        {r.completionTrend && (
          <p className="text-xs text-ink-secondary">
            Completion trend: {r.completionTrend.direction} ({monthLabel(r.completionTrend.fromMonth)} {pct(r.completionTrend.from)} → {monthLabel(r.completionTrend.toMonth)} {pct(r.completionTrend.to)}).
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Month by month</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-border/8 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {['Month', 'Eligible days', 'Completed', 'Completion', 'Challenge pts', 'Challenge avg', 'Projected monthly tier', 'Data status'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rowsShown.map((m) => (
                <tr key={m.month} className="border-b border-border/6 last:border-0 text-navy">
                  <td className="px-4 py-3 font-semibold">{monthLabel(m.month)}{m.inProgress ? ' (in progress)' : ''}</td>
                  <td className="px-4 py-3">{m.eligibleDays}{m.unverifiableDays > 0 && <span className="text-xs text-ink-muted"> ({m.unverifiableDays} unverifiable)</span>}</td>
                  <td className="px-4 py-3">{m.completedEntries}</td>
                  <td className="px-4 py-3">{m.completionUsable ? pct(m.completionRate) : '—'}</td>
                  <td className="px-4 py-3">{m.challengeUsable ? num(m.challengePoints, 1) : '—'}</td>
                  <td className="px-4 py-3">{m.challengeUsable ? num(m.challengeAverage) : '—'}{m.challengeUsable && m.challengeUnverifiableDays > 0 && <span className="text-xs text-ink-muted"> ({m.challengeUnverifiableDays} unverifiable)</span>}</td>
                  <td className="px-4 py-3">{m.monthTierComputable ? <TierChip tier={m.projectedTier} label={m.projectedTier ? `Tier ${m.projectedTier}` : 'Building'} /> : '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-secondary">{statusText(m)}</td>
                </tr>
              ))}
              {rowsShown.length === 0 && <tr><td className="px-4 py-6 text-ink-secondary" colSpan={8}>No eligible days in this window yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-muted">
          “Insufficient historical detail” = too many days in that month predate the live app and can't be verified from migrated records, so that
          measure is left out for the month rather than guessed (completion and Challenge are judged separately). Combined figures sum the underlying days across usable months — they are not an average of monthly percentages.
        </p>
      </section>

      <Link to={`/hq/members/${p.id}`} className="inline-block text-sm font-semibold text-link">
        View full member profile, including Challenge history and category breakdown →
      </Link>
    </div>
  );
}
