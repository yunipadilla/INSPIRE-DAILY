import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Accessible password input with a show/hide toggle. Reused wherever a
 * password field is needed; uses the existing lucide-react icon set already
 * in the project rather than adding a new icon dependency.
 */
export default function PasswordField({ label = 'Password', value, onChange, autoComplete, error, inputClassName = 'input-bubble' }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-navy mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={`${inputClassName} pr-11`}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-full text-navy/50 hover:text-navy/80 transition-colors"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p id={errorId} className="text-sm text-rose-500 mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
