export default function GoalsOverview({ overview }) {
  return (
    <div className="card p-4 grid grid-cols-3 gap-2 text-center gradient-goals">
      <div>
        <div className="text-xl font-extrabold text-navy">{overview.activeCount}</div>
        <div className="text-[10px] uppercase text-ink-secondary">Active</div>
      </div>
      <div>
        <div className="text-xl font-extrabold text-navy">{overview.completedThisMonthCount}</div>
        <div className="text-[10px] uppercase text-ink-secondary">Completed this month</div>
      </div>
      <div className="truncate">
        <div className="text-sm font-semibold text-navy truncate">{overview.mostRecentlyUpdated?.name || '—'}</div>
        <div className="text-[10px] uppercase text-ink-secondary">Most recent</div>
      </div>
    </div>
  );
}
