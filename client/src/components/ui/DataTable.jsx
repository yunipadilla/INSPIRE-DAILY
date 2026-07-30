import { Link } from 'react-router-dom';

/**
 * Card-row table — no harsh grid lines. Collapses to stacked cards below
 * `sm`. columns: [{ key, label, render?(row) }]
 *
 * When `getRowHref(row)` is provided, each row is exactly one real <Link> —
 * Tab reaches it and Enter activates it natively, no custom key handling.
 * On mobile the Link simply wraps the whole card (valid HTML, no table
 * constraints). On desktop the Link lives in the first cell, and its
 * clickable area is stretched to fill that cell via `.row-link-stretch`
 * (an invisible ::after) so the whole Name cell — not just the text's own
 * baseline box — is a mouse target. That stretch is deliberately scoped to
 * the cell, not the whole row: `position: relative` on a <tr> is an
 * unreliable containing block for absolutely-positioned descendants across
 * browsers, so a full-row hit area isn't attempted. Either way, only one
 * real interactive element exists per row, and no <tr> is ever wrapped in
 * an <a> (which would be invalid table markup).
 *
 * `onRowClick` remains as a fallback for a non-navigating use case; prefer
 * `getRowHref` whenever the row's action is "go to a URL," since that's what
 * gives keyboard/screen-reader users a real, focusable link.
 */
export default function DataTable({ columns, rows, getRowHref, onRowClick, getRowKey = (r) => r.id, emptyContent = null }) {
  if (!rows || rows.length === 0) {
    return emptyContent;
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm hidden sm:table">
        <thead>
          <tr className="border-b border-border/8">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = getRowHref?.(row);
            return (
              <tr
                key={getRowKey(row)}
                className={`border-b border-border/6 last:border-0 ${
                  href || onRowClick ? 'hover:bg-surface-soft' : ''
                }`}
                onClick={!href && onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-navy ${i === 0 && href ? 'relative' : ''}`}
                  >
                    {i === 0 && href ? (
                      <Link to={href} className="row-focus-link row-link-stretch font-medium">
                        {col.render ? col.render(row) : row[col.key]}
                      </Link>
                    ) : col.render ? (
                      col.render(row)
                    ) : (
                      row[col.key]
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="sm:hidden divide-y divide-border/6">
        {rows.map((row) => {
          const href = getRowHref?.(row);
          const content = columns.map((col) => (
            <div key={col.key} className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{col.label}</span>
              <span className="text-sm text-navy text-right">{col.render ? col.render(row) : row[col.key]}</span>
            </div>
          ));

          if (href) {
            return (
              <Link key={getRowKey(row)} to={href} className="row-focus-link block p-4 space-y-1.5 active:bg-surface-soft">
                {content}
              </Link>
            );
          }

          return (
            <div
              key={getRowKey(row)}
              className={`p-4 space-y-1.5 ${onRowClick ? 'cursor-pointer active:bg-surface-soft' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
