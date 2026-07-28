import { useId } from 'react';

/** Label + <select>, same visual treatment as FormField's input. */
export default function SelectField({ label, value, onChange, options, required, hint, error }) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-navy mb-1.5">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <select
        id={id}
        className="input-bubble"
        value={value}
        onChange={onChange}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-muted mt-1">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
