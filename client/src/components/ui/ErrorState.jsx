import { AlertTriangle } from 'lucide-react';

/** Pairs with EmptyState — for a failed fetch, not an empty-but-successful result. */
export default function ErrorState({ title = 'Something went wrong', description, onRetry }) {
  return (
    <div className="text-center py-10 px-4">
      <span
        className="icon-badge mx-auto mb-3"
        style={{ background: 'rgb(var(--color-danger) / 0.15)', width: 44, height: 44 }}
      >
        <AlertTriangle size={20} color="rgb(var(--color-danger))" />
      </span>
      <p className="text-sm font-semibold text-navy">{title}</p>
      {description && <p className="text-sm text-ink-muted mt-1 max-w-xs mx-auto">{description}</p>}
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary pressable mt-4 px-4 py-2 text-sm">
          Try again
        </button>
      )}
    </div>
  );
}
