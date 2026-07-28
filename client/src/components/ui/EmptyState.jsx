/** Consistent "nothing here yet" treatment — used instead of a bare blank area. */
export default function EmptyState({ icon = '✨', title, description, action }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-3xl mb-2" aria-hidden="true">
        {icon}
      </div>
      <p className="text-sm font-semibold text-navy">{title}</p>
      {description && <p className="text-sm text-ink-muted mt-1 max-w-xs mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
