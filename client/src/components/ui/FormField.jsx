import { useId } from 'react';

/** Label + input + hint/error, built on the shared .input-bubble treatment. */
export default function FormField({
  label,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  required,
  autoComplete,
  inputClassName = 'input-bubble',
  ...rest
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-navy mb-1.5">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        className={inputClassName}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
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

/** A FormField preset for dates — same treatment, just the right input type. */
export function DateField(props) {
  return <FormField {...props} type="date" />;
}
