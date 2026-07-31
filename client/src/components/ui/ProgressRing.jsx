/**
 * SVG circular progress ring — the Goals page's standard "quest" progress
 * indicator. Token-driven stroke color so it adapts across light/dark and
 * per-goal-type accent without any hardcoded hex.
 */
export default function ProgressRing({
  value = 0,
  max = 100,
  size = 64,
  strokeWidth = 6,
  colorVar = '--color-primary',
  label,
  children,
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`rgb(var(--color-surface-soft))`}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`rgb(var(${colorVar}))`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children ?? (
          <>
            <span className="text-sm font-extrabold text-navy leading-none">{Math.round(pct)}%</span>
            {label && <span className="text-[9px] text-navy/50 font-semibold uppercase mt-0.5">{label}</span>}
          </>
        )}
      </div>
    </div>
  );
}
