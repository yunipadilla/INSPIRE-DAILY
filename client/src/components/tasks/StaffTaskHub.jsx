export default function StaffTaskHub({ signups }) {
  return (
    <div className="card divide-y divide-[#f0f0f0]">
      {signups.length === 0 && <p className="p-4 text-sm text-navy/50">No one has signed up for a task yet.</p>}
      {signups.map((s) => (
        <div key={s.id} className="p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-navy truncate">{s.taskTitle}</p>
            <p className="text-xs text-navy/50">
              {s.userName} · {s.appRole}
            </p>
          </div>
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${
              s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {s.status === 'completed' ? 'Completed' : 'In Progress'}
          </span>
        </div>
      ))}
    </div>
  );
}
