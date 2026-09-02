import { AreaChart, Area, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

function formatDate(d) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const tooltipStyle = {
  background: 'rgb(var(--color-surface-elevated))',
  border: '1px solid rgb(var(--color-border) / 0.12)',
  borderRadius: 10,
  fontSize: 12,
};

/** Shared HQ trend chart — area (default) or line, one or two series, token-
 * driven color, no fabricated data: every point comes straight from the
 * server's day-scaffolded series (gaps render as real zeros, not omitted). */
export default function TrendChart({ data, dataKey, label, colorVar = '--color-primary', height = 180, variant = 'area', secondaryKey, secondaryColorVar = '--color-lavender', secondaryLabel }) {
  if (!data || data.every((d) => Number(d[dataKey]) === 0 && (!secondaryKey || Number(d[secondaryKey]) === 0))) {
    return (
      <div className="card p-4 flex items-center justify-center text-xs text-ink-muted" style={{ height }}>
        No activity in this window yet.
      </div>
    );
  }

  const Chart = variant === 'line' ? LineChart : AreaChart;
  const Mark = variant === 'line' ? Line : Area;

  return (
    <div className="card p-4">
      {label && <p className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">{label}</p>}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <Chart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-border) / 0.08)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
            <Tooltip labelFormatter={formatDate} contentStyle={tooltipStyle} />
            <Mark type="monotone" dataKey={dataKey} name={secondaryLabel ? label : undefined} stroke={`rgb(var(${colorVar}))`} fill={`rgb(var(${colorVar}) / 0.18)`} strokeWidth={2} dot={false} />
            {secondaryKey && (
              <Mark type="monotone" dataKey={secondaryKey} name={secondaryLabel} stroke={`rgb(var(${secondaryColorVar}))`} fill={`rgb(var(${secondaryColorVar}) / 0.18)`} strokeWidth={2} dot={false} />
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
