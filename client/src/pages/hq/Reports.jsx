import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import PageTitle from '../../components/ui/PageTitle';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';

const pct = (n) => (n == null ? 'n/a' : `${Math.round(n * 100)}%`);

const EXPORTS = [
  { type: 'dailyScores', label: 'Daily Scores participation' },
  { type: 'goals', label: 'Goals' },
  { type: 'tasks', label: 'Tasks' },
  { type: 'volunteerHours', label: 'Volunteer hours' },
  { type: 'challenge', label: 'Challenge standings' },
  { type: 'inactive', label: 'Inactive participants' },
];

function ExportRow({ type, label }) {
  return (
    <div className="flex items-center justify-between p-3">
      <span className="text-sm font-medium text-navy">{label}</span>
      <div className="flex gap-2">
        <a className="btn-secondary px-3 py-1.5 text-xs" href={`/api/hq/reports/export/${type}?format=csv`}>CSV</a>
        <a className="btn-secondary px-3 py-1.5 text-xs" href={`/api/hq/reports/export/${type}?format=xlsx`}>XLSX</a>
      </div>
    </div>
  );
}

function ProgramReportCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiFetch('/hq/reports/program').then(setData).catch(() => setError(true));
  }, []);

  if (error) return <ErrorState description="Couldn't load the Program Report preview." />;
  if (!data) return <Skeleton height="220px" />;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy uppercase tracking-wide">Program Report</h3>
        <a className="btn-bubble gradient-rainbow text-white pressable px-3 py-1.5 text-xs inline-block" href="/api/hq/reports/program/export">Export PDF</a>
      </div>
      <p className="text-xs text-ink-muted">Review before exporting — {data.periodLabel.toLowerCase()}.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        <div><span className="text-ink-muted">Participants:</span> <span className="font-semibold text-navy">{data.totalParticipants}</span></div>
        <div><span className="text-ink-muted">30d participation:</span> <span className="font-semibold text-navy">{pct(data.participationRate30d)}</span></div>
        <div><span className="text-ink-muted">Avg streak:</span> <span className="font-semibold text-navy">{data.averageActiveStreak.toFixed(1)}</span></div>
        <div><span className="text-ink-muted">Goal completion:</span> <span className="font-semibold text-navy">{pct(data.goalCompletionRate)}</span></div>
        <div><span className="text-ink-muted">Tasks completed:</span> <span className="font-semibold text-navy">{data.tasksCompleted}</span></div>
        <div><span className="text-ink-muted">Volunteer hrs:</span> <span className="font-semibold text-navy">{data.totalVolunteerHours.toFixed(1)}</span></div>
        <div><span className="text-ink-muted">Challenge pts:</span> <span className="font-semibold text-navy">{data.challengeTotalPoints.toFixed(1)}</span></div>
        <div><span className="text-ink-muted">Badges awarded:</span> <span className="font-semibold text-navy">{data.badgesAwarded}</span></div>
        <div><span className="text-ink-muted">Inactive (3+d):</span> <span className="font-semibold text-navy">{data.inactiveParticipants.length}</span></div>
      </div>
    </div>
  );
}

function ParticipantImpactCard() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/hq/members?search=${encodeURIComponent(search)}&pageSize=5`).then((d) => setResults(d.members));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!selected) return;
    apiFetch(`/hq/reports/participant/${selected.id}?days=${days}`).then(setPreview).catch(() => setPreview(null));
  }, [selected, days]);

  return (
    <div className="card p-5 space-y-3">
      <h3 className="text-sm font-bold text-navy uppercase tracking-wide">Participant Impact Report</h3>
      {!selected ? (
        <>
          <input
            className="input-bubble"
            placeholder="Search a participant by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {results.length > 0 && (
            <div className="card divide-y divide-border/6 overflow-hidden">
              {results.map((m) => (
                <button key={m.id} className="w-full text-left p-3 text-sm hover:bg-surface-soft" onClick={() => { setSelected(m); setSearch(''); setResults([]); }}>
                  {m.fullName} — <span className="text-ink-muted">{m.email}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-navy">{selected.fullName}</p>
            <div className="flex items-center gap-2">
              <select className="input-bubble w-auto text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              <button className="text-xs text-ink-muted underline" onClick={() => { setSelected(null); setPreview(null); }}>Change</button>
            </div>
          </div>
          {preview ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                <div><span className="text-ink-muted">Submissions:</span> <span className="font-semibold text-navy">{preview.dailyScoreSubmissions}</span></div>
                <div><span className="text-ink-muted">Streak:</span> <span className="font-semibold text-navy">{preview.streakCount}</span></div>
                <div><span className="text-ink-muted">Goals active/done:</span> <span className="font-semibold text-navy">{preview.goals.active}/{preview.goals.completed}</span></div>
                <div><span className="text-ink-muted">Tasks completed:</span> <span className="font-semibold text-navy">{preview.tasks.completed}</span></div>
                <div><span className="text-ink-muted">Volunteer hrs:</span> <span className="font-semibold text-navy">{preview.volunteerHours.toFixed(1)}</span></div>
                <div><span className="text-ink-muted">Challenge pts (current period):</span> <span className="font-semibold text-navy">{preview.challenge.currentPeriodPoints.toFixed(1)}</span></div>
                <div><span className="text-ink-muted">Badges:</span> <span className="font-semibold text-navy">{preview.badges.length}</span></div>
              </div>
              <a className="btn-bubble gradient-rainbow text-white pressable px-3 py-1.5 text-xs inline-block" href={`/api/hq/reports/participant/${selected.id}/export?days=${days}`}>Export PDF</a>
            </>
          ) : (
            <Skeleton height="100px" />
          )}
        </>
      )}
    </div>
  );
}

export default function Reports() {
  return (
    <div className="space-y-6">
      <PageTitle>Reports</PageTitle>
      <ProgramReportCard />
      <ParticipantImpactCard />
      <div>
        <h3 className="text-sm font-bold text-navy uppercase tracking-wide mb-2">Data exports</h3>
        <div className="card divide-y divide-border/6 overflow-hidden">
          {EXPORTS.map((e) => (
            <ExportRow key={e.type} {...e} />
          ))}
        </div>
      </div>
    </div>
  );
}
