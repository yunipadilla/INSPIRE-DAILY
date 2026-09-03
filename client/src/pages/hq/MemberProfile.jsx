import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import PageTitle from '../../components/ui/PageTitle';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ProgressBar from '../../components/ui/ProgressBar';
import ProgressRing from '../../components/ui/ProgressRing';
import Medal from '../../components/ui/Medal';
import AwardBadgeModal from '../../components/hq/AwardBadgeModal';

const TABS = ['Overview', 'Daily Scores', 'Goals', 'Badges', 'Inspire Challenge', 'Tasks', 'Volunteer Hours', 'Activity'];
const GOAL_TYPE_LABELS = { reading: 'Reading', fitness_daily: 'Daily Fitness', fitness_weekly: 'Weekly Fitness', learning: 'Learning', meditation: 'Meditation', custom: 'Custom' };
const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);

/** Non-Sunday day count between two ISO dates inclusive — mirrors the
 * server's rest-day rule for a client-side participation estimate over the
 * visible (last-30) window only; labeled as such, not claimed as all-time. */
function nonRestDayCount(start, end) {
  let count = 0;
  const cur = new Date(`${start}T12:00:00Z`);
  const endD = new Date(`${end}T12:00:00Z`);
  while (cur <= endD) {
    if (cur.getUTCDay() !== 0) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function AccountActions({ member, isAdmin, onChanged }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isAdmin) return null;
  const suspended = member.accountStatus === 'denied';

  async function toggleStatus() {
    setBusy(true);
    try {
      await apiFetch(`/hq/members/${member.id}/${suspended ? 'activate' : 'suspend'}`, { method: 'POST' });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      await apiFetch(`/hq/members/${member.id}`, { method: 'DELETE', body: { confirmEmail: confirmText } });
      window.location.href = '/hq/members';
    } catch (err) {
      alert(err.data?.error || 'Could not delete this account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={toggleStatus}>
        {suspended ? 'Reactivate account' : 'Suspend account'}
      </button>
      <button className="text-xs font-bold px-3 py-1.5 rounded-full bg-danger/10 text-danger" onClick={() => setConfirmOpen(true)}>
        Delete permanently
      </button>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="card p-5 max-w-sm w-full space-y-3">
            <h3 className="font-bold text-navy">Permanently delete this account?</h3>
            <p className="text-sm text-ink-secondary">
              This deletes {member.fullName} and every Daily Score, goal, badge, task, and Challenge entry they have —
              irreversibly. Suspending is reversible; this is not. Type the account's exact email to confirm.
            </p>
            <input className="input-bubble" placeholder={member.email} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button
                className="text-xs font-bold px-3 py-1.5 rounded-full bg-danger text-onbrand disabled:opacity-50"
                disabled={busy || confirmText.trim().toLowerCase() !== member.email.toLowerCase()}
                onClick={confirmDelete}
              >
                Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MemberProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = ['admin', 'super_admin'].includes(user?.systemRole);
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [tab, setTab] = useState('Overview');

  function load() {
    setError(false);
    setData(null);
    apiFetch(`/hq/members/${id}`).then(setData).catch(() => setError(true));
  }

  useEffect(load, [id]);

  if (error) return <ErrorState description="Couldn't load this member's profile." onRetry={load} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton height="2rem" width="200px" />
        <Skeleton height="120px" />
        <Skeleton height="200px" />
      </div>
    );
  }

  const { user: member, dailyScores, goals, challenge, challengeHistory, tasks, badges, volunteerHours, legacyStatus, timeline } = data;
  const activeGoals = goals.filter((g) => !g.completed);
  const completedGoals = goals.filter((g) => g.completed);
  const tasksCompleted = tasks.filter((t) => t.status === 'completed');

  const dsDates = dailyScores.map((d) => d.date).sort();
  const dsWindowDays = dsDates.length ? nonRestDayCount(dsDates[0], dsDates[dsDates.length - 1]) : 0;
  const dsParticipation = dsWindowDays > 0 ? dailyScores.length / dsWindowDays : null;
  const dsMissing = dsWindowDays > 0 ? Math.max(0, dsWindowDays - dailyScores.length) : 0;

  const catAvg = (field, bool = true) => {
    if (challengeHistory.length === 0) return null;
    const sum = challengeHistory.reduce((s, c) => s + (bool ? (c[field] ? 1 : 0) : Number(c[field] || 0)), 0);
    return sum / challengeHistory.length;
  };

  return (
    <div className="space-y-6">
      <Link to="/hq/members" className="inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-navy">
        <ChevronLeft size={16} /> All members
      </Link>

      <div className="card p-5 flex items-center gap-4 flex-wrap">
        <div className="w-16 h-16 rounded-full gradient-rainbow flex items-center justify-center text-xl font-bold text-onbrand overflow-hidden flex-shrink-0">
          {member.profilePhotoUrl ? (
            <img src={member.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            `${member.firstName[0]}${member.lastName[0]}`
          )}
        </div>
        <div className="min-w-0 flex-1">
          <PageTitle as="h1" className="text-xl">{member.fullName}</PageTitle>
          <p className="text-sm text-ink-secondary truncate">{member.email}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-soft text-ink-secondary">{member.appRole}</span>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-surface-soft text-ink-secondary">{member.accountStatus === 'denied' ? 'Suspended' : member.accountStatus}</span>
            <span className="text-xs text-ink-muted">🔥 {member.streakCount} streak · 🛡️ {member.streakShields}</span>
          </div>
        </div>
        <AccountActions member={member} isAdmin={isAdmin} onChanged={load} />
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              tab === t ? 'bg-primary text-onbrand' : 'bg-surface-soft text-ink-secondary hover:text-navy'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{activeGoals.length}/{completedGoals.length}</div><div className="text-[10px] uppercase text-ink-muted">Active/completed goals</div></div>
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{badges.length}</div><div className="text-[10px] uppercase text-ink-muted">Badges</div></div>
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{challenge.totalPoints.toFixed(0)}</div><div className="text-[10px] uppercase text-ink-muted">Challenge pts</div></div>
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{volunteerHours.total.toFixed(0)}</div><div className="text-[10px] uppercase text-ink-muted">Volunteer hrs</div></div>
          </div>
          <div className="card p-4 grid sm:grid-cols-2 gap-2 text-sm">
            <div><span className="text-ink-muted">Member since:</span> <span className="text-navy font-medium">{new Date(member.createdAt).toLocaleDateString()}</span></div>
            <div><span className="text-ink-muted">Last Daily Score:</span> <span className="text-navy font-medium">{dsDates[dsDates.length - 1] || '—'}</span></div>
            <div><span className="text-ink-muted">Tasks completed:</span> <span className="text-navy font-medium">{tasksCompleted.length}</span></div>
            <div><span className="text-ink-muted">Phone:</span> <span className="text-navy font-medium">{member.phone || '—'}</span></div>
          </div>

          {/* Historical Base44 migration status — read-only, derived only from
              live DB state, never from re-reading the offline export. */}
          <div className="card p-4 space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Historical data (Base44)</h3>
            {legacyStatus.state === 'imported' ? (
              <p className="text-sm text-navy">
                Imported. {legacyStatus.archivedFactCount > 0 && `${legacyStatus.archivedFactCount} archived historical fact(s) across ${legacyStatus.archivedFactGroups} group(s) — see the Goals tab.`}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">No legacy import on record for this account.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'Daily Scores' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{pct(dsParticipation)}</div><div className="text-[10px] uppercase text-ink-muted">Participation (shown window)</div></div>
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{dsMissing}</div><div className="text-[10px] uppercase text-ink-muted">Missing days</div></div>
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{dailyScores.length}</div><div className="text-[10px] uppercase text-ink-muted">Submissions shown</div></div>
          </div>
          {dailyScores.length === 0 ? (
            <EmptyState icon="📊" title="No Daily Scores submissions yet" />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/8 text-ink-muted uppercase text-[10px]">
                    <th className="text-left p-2">Date</th><th className="p-2">Best Self</th><th className="p-2">CEO Mindset</th>
                    <th className="p-2">Grit</th><th className="p-2">Happiness</th><th className="p-2">Sleep</th>
                    <th className="p-2">Earned Way</th><th className="p-2">Vol. Hrs</th><th className="text-left p-2">Challenges</th><th className="text-left p-2">Goals Worked On</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyScores.map((d) => (
                    <tr key={d.date} className="border-b border-border/6 last:border-0">
                      <td className="p-2 whitespace-nowrap">{d.date}</td>
                      <td className="p-2 text-center">{d.bestSelf}</td><td className="p-2 text-center">{d.ceoMindset}</td>
                      <td className="p-2 text-center">{d.grit}</td><td className="p-2 text-center">{d.happiness}</td><td className="p-2 text-center">{d.sleep}</td>
                      <td className="p-2 text-center">{d.earnedWay ? '✅' : '—'}</td>
                      <td className="p-2 text-center">{d.volunteerHours}</td>
                      <td className="p-2 max-w-[160px] truncate" title={d.challenges}>{d.challenges || '—'}</td>
                      <td className="p-2 max-w-[160px] truncate" title={d.goalsWorkedOn}>{d.goalsWorkedOn || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Goals' && (
        <div className="space-y-5">
          {goals.length === 0 ? (
            <EmptyState icon="🎯" title="No goals started yet" />
          ) : (
            <div className="space-y-3">
              {goals.map((g) => (
                <div key={g.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-navy">{g.name}</span>{' '}
                      <span className="text-xs text-ink-muted">({GOAL_TYPE_LABELS[g.type] || g.type})</span>
                      {g.isHistoricalImport && <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-lavender/20 text-ink-secondary">Historical import</span>}
                    </div>
                    <span className={g.completed ? 'text-success font-semibold text-xs' : 'text-ink-muted text-xs'}>
                      {g.completed ? `✓ Completed ${g.completedDate}` : 'In progress'}
                    </span>
                  </div>
                  {g.books?.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {g.books.map((b) => (
                        <div key={b.id} className="flex items-center gap-2 text-xs">
                          <ProgressRing value={b.currentPage} max={b.totalPages || 1} size={28} strokeWidth={4} colorVar="--color-blue"><span className="text-[8px] font-bold">{b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : 0}%</span></ProgressRing>
                          <span className="text-navy">{b.title}</span>
                          <span className="text-ink-muted">{b.currentPage}/{b.totalPages} pages{b.completed ? ' — done' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {!g.books?.length && g.logs?.length > 0 && (
                    <p className="mt-1 text-xs text-ink-muted">{g.logs.length} log(s) — most recent {g.logs[0]?.date}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-ink-muted">{activeGoals.length} active · {completedGoals.length} completed</p>

          {legacyStatus.archivedFactCount > 0 && (
            <div className="card p-4 border-2 border-dashed border-border/20">
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-1">Historical Legacy Activity (read-only)</h3>
              <p className="text-sm text-ink-secondary">
                {legacyStatus.archivedFactCount} archived Base44 activity record(s) across {legacyStatus.archivedFactGroups} legacy goal(s) —
                type unknown from the original export, so these are preserved as raw historical facts, not shown as an active goal.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'Badges' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Badges</h2>
            <button type="button" onClick={() => setShowAwardModal(true)} className="pressable text-xs font-bold px-3 py-1.5 rounded-full bg-primary/12 text-primary">
              + Award Badge
            </button>
          </div>
          {badges.length === 0 ? (
            <EmptyState icon="🏅" title="No badges earned yet" />
          ) : (
            <div className="space-y-2">
              {badges.map((b) => (
                <div key={b.id} className="card p-3 flex items-center gap-3">
                  <Medal icon={b.iconEmoji} category={b.badgeType} title={b.name} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy">{b.name} <span className="text-[9px] uppercase text-ink-muted">{b.badgeType} · {b.source}</span></p>
                    <p className="text-xs text-ink-muted truncate">
                      Earned {b.earnedDate}{b.awardedByName ? ` — awarded by ${b.awardedByName}` : ''}{b.reason ? ` — "${b.reason}"` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {showAwardModal && <AwardBadgeModal memberId={id} onClose={() => setShowAwardModal(false)} onAwarded={load} />}
        </div>
      )}

      {tab === 'Inspire Challenge' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{challenge.totalPoints.toFixed(1)}</div><div className="text-[10px] uppercase text-ink-muted">Total points</div></div>
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{challenge.daysLogged}</div><div className="text-[10px] uppercase text-ink-muted">Days logged</div></div>
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{challenge.daysLogged ? (challenge.totalPoints / challenge.daysLogged).toFixed(1) : '—'}</div><div className="text-[10px] uppercase text-ink-muted">Avg/day</div></div>
          </div>
          {challengeHistory.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="card p-2 text-center"><div className="font-bold text-navy">{pct(catAvg('hydration'))}</div><div className="text-ink-muted">Hydration</div></div>
              <div className="card p-2 text-center"><div className="font-bold text-navy">{pct(catAvg('exercise'))}</div><div className="text-ink-muted">Exercise</div></div>
              <div className="card p-2 text-center"><div className="font-bold text-navy">{pct(catAvg('nutrition'))}</div><div className="text-ink-muted">Nutrition</div></div>
              <div className="card p-2 text-center"><div className="font-bold text-navy">{catAvg('mindfulnessSessions', false)?.toFixed(1) ?? '—'}</div><div className="text-ink-muted">Avg mindfulness</div></div>
            </div>
          )}
          {challengeHistory.length === 0 ? (
            <EmptyState icon="🏆" title="No Inspire Challenge entries yet" />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/8 text-ink-muted uppercase text-[10px]">
                    <th className="text-left p-2">Date</th><th className="p-2">Points</th><th className="text-left p-2">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {challengeHistory.map((c) => (
                    <tr key={c.date} className="border-b border-border/6 last:border-0">
                      <td className="p-2">{c.date}</td>
                      <td className="p-2 text-center">{c.totalPoints.toFixed(1)}</td>
                      <td className="p-2">{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Tasks' && (
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">{tasksCompleted.length} completed · {tasks.length - tasksCompleted.length} in progress · {tasksCompleted.reduce((s, t) => s + Number(t.hoursSpent || 0), 0).toFixed(1)} hours total</p>
          {tasks.length === 0 ? (
            <EmptyState icon="📋" title="No task activity yet" />
          ) : (
            <div className="card divide-y divide-border/6 overflow-hidden">
              {tasks.map((t) => (
                <div key={t.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-navy font-medium">{t.title}</span>
                    <span className={t.status === 'completed' ? 'text-success font-semibold text-xs' : 'text-warning font-semibold text-xs'}>
                      {t.status === 'completed' ? '✓ Completed' : 'In progress'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted">{t.level} · {t.hoursSpent || 0} hrs{t.notes ? ` — "${t.notes}"` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'Volunteer Hours' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{volunteerHours.total.toFixed(1)}</div><div className="text-[10px] uppercase text-ink-muted">Total hours</div></div>
            <div className="card p-3 text-center"><div className="text-lg font-extrabold text-navy">{volunteerHours.lastActivity || '—'}</div><div className="text-[10px] uppercase text-ink-muted">Latest activity</div></div>
          </div>
          <p className="text-xs text-ink-muted">Sourced from Daily Scores — the single authoritative volunteer-hours field.</p>
        </div>
      )}

      {tab === 'Activity' && (
        <div>
          {timeline.length === 0 ? (
            <EmptyState icon="🕒" title="No recent activity" />
          ) : (
            <div className="card divide-y divide-border/6 overflow-hidden">
              {timeline.map((t, i) => (
                <div key={i} className="flex items-center justify-between p-3 text-sm">
                  <span className="text-navy">{t.description}</span>
                  <span className="text-xs text-ink-muted flex-shrink-0 ml-2">{new Date(t.occurredAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
