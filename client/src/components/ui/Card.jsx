import { Link } from 'react-router-dom';

/** Plain three-dimensional card — thin wrapper so future pages don't need to remember the raw class names. */
export function Card({ lift = false, className = '', children, ...props }) {
  return (
    <div className={`card ${lift ? 'card-lift pressable' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}

/** A card that is itself the tap target — an icon, a label, and a status slot (e.g. Home's "Today's Actions"). */
export function ActionCard({ to, onClick, icon, iconBg, label, accent, status, className = '' }) {
  const Comp = to ? Link : 'button';
  return (
    <Comp
      to={to}
      onClick={onClick}
      className={`pressable card card-lift p-4 flex flex-col justify-between h-28 overflow-hidden relative text-left ${className}`}
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-center gap-2">
        <span className="icon-badge" style={{ background: iconBg }}>
          {icon}
        </span>
        <span className="text-sm font-semibold text-navy leading-tight">{label}</span>
      </div>
      {status}
    </Comp>
  );
}

/** A small metric tile — value + label + accent-colored top border + emoji. */
export function StatCard({ value, label, emoji, accent, bg }) {
  return (
    <div className="card p-3 text-center" style={{ borderTop: `3px solid ${accent}`, background: bg }}>
      <div className="text-base mb-0.5">{emoji}</div>
      <div className="text-lg font-extrabold text-navy">{value}</div>
      <div className="text-[10px] uppercase text-ink-muted">{label}</div>
    </div>
  );
}
