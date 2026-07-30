import { Link, useLocation } from 'react-router-dom';

const LABELS = {
  hq: 'Inspire HQ',
  members: 'Members',
};

/** Derives breadcrumbs from the URL — a bare UUID segment (a member id) renders as "Profile". */
export default function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  const crumbs = segments.map((seg, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    const isLast = i === segments.length - 1;
    const looksLikeId = !LABELS[seg] && seg.length > 20;
    const label = LABELS[seg] || (looksLikeId ? 'Profile' : seg);
    return { path, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0 overflow-hidden">
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <span className="text-ink-muted">/</span>}
          {c.isLast ? (
            <span className="font-semibold text-navy truncate">{c.label}</span>
          ) : (
            <Link to={c.path} className="text-ink-secondary hover:text-navy truncate">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
