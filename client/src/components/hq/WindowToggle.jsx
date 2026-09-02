const OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

/** Shared 7/30/90-day window switcher — every HQ analytics section uses the
 * same three options so "the window" means the same thing everywhere. */
export default function WindowToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-full bg-surface-soft p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
            value === o.value ? 'bg-surface-elevated text-navy shadow-sm' : 'text-ink-muted hover:text-navy'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
