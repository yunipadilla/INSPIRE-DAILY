/** Track + fill progress indicator — width transition respects prefers-reduced-motion globally via CSS. */
export default function ProgressBar({ value, max = 100, colorVar = '--color-primary', label }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div>
      {label && <p className="text-xs font-medium text-ink-secondary mb-1">{label}</p>}
      <div className="progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: `rgb(var(${colorVar}))` }} />
      </div>
    </div>
  );
}
