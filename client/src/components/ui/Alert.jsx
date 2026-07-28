import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

const VARIANTS = {
  info: { icon: Info, colorVar: '--color-primary' },
  success: { icon: CheckCircle2, colorVar: '--color-success' },
  warning: { icon: AlertTriangle, colorVar: '--color-warning' },
  danger: { icon: XCircle, colorVar: '--color-danger' },
};

/** Inline message banner — form errors, success confirmations, warnings. */
export default function Alert({ variant = 'info', children }) {
  const { icon: Icon, colorVar } = VARIANTS[variant] || VARIANTS.info;
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className="flex items-start gap-2.5 rounded-2xl p-3 text-sm bg-surface-soft"
    >
      <Icon size={18} className="flex-shrink-0 mt-0.5" style={{ color: `rgb(var(${colorVar}))` }} aria-hidden="true" />
      <span className="text-ink-primary">{children}</span>
    </div>
  );
}
