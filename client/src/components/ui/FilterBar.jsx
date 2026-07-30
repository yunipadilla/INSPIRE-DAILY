/**
 * Search input + a row of select filters.
 * filters: [{ key, label, value, onChange, options: [{ value, label }] }]
 */
export default function FilterBar({ search, onSearchChange, searchPlaceholder = 'Search…', filters = [] }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
      <div className="flex-1 min-w-0">
        <input
          type="search"
          className="input-bubble"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search"
        />
      </div>
      {filters.map((f) => (
        <select
          key={f.key}
          className="input-bubble sm:w-auto"
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          aria-label={f.label}
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
