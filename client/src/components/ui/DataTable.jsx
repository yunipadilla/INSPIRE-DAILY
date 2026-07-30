/**
 * Card-row table — no harsh grid lines. Collapses to stacked key/value
 * cards below the `sm` breakpoint instead of forcing horizontal scroll.
 * columns: [{ key, label, render?(row) }]
 */
export default function DataTable({ columns, rows, onRowClick, getRowKey = (r) => r.id, emptyContent = null }) {
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
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              className={`border-b border-border/6 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-surface-soft' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-navy">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sm:hidden divide-y divide-border/6">
        {rows.map((row) => (
          <div
            key={getRowKey(row)}
            className={`p-4 space-y-1.5 ${onRowClick ? 'cursor-pointer active:bg-surface-soft' : ''}`}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((col) => (
              <div key={col.key} className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{col.label}</span>
                <span className="text-sm text-navy text-right">{col.render ? col.render(row) : row[col.key]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
