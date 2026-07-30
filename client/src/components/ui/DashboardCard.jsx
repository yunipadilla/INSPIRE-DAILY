import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/**
 * HQ metric tile — value, label, optional trend delta and sparkline slot.
 * The Inspire HQ equivalent of Daily's StatCard (Card.jsx) — kept separate
 * since HQ's density and trend indicator are a genuinely different need,
 * not a reskin of the same shape.
 */
export default function DashboardCard({ label, value, icon, colorVar = '--color-primary', trend, hint }) {
  const TrendIcon = trend == null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColorVar = trend > 0 ? '--color-success' : trend < 0 ? '--color-danger' : '--color-text-muted';

  return (
    <div className="card p-4" style={{ borderTop: `3px solid rgb(var(${colorVar}))` }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
        {icon && (
          <span className="text-lg" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-extrabold text-navy">{value}</span>
        {trend != null && (
          <span
            className="flex items-center gap-0.5 text-xs font-semibold mb-1"
            style={{ color: `rgb(var(${trendColorVar}))` }}
          >
            <TrendIcon size={13} />
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-ink-muted mt-1">{hint}</p>}
    </div>
  );
}
