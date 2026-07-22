import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { value: 'intern', label: 'Intern' },
  { value: 'postgrad', label: 'Postgrad' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'staff', label: 'Staff' },
];

// Parental consent is disabled for now per program decision — flip this back
// to true (and re-enable PARENTAL_CONSENT_ENABLED on the server) to bring
// back the under-16 gate without any other code changes.
const PARENTAL_CONSENT_ENABLED = false;

function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const today = new Date();
  const bday = new Date(`${birthday}T00:00:00`);
  let age = today.getFullYear() - bday.getFullYear();
  const m = today.getMonth() - bday.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bday.getDate())) age -= 1;
  return age;
}

export default function Signup() {
  const { signup } = useAuth();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    birthday: '',
    email: '',
    password: '',
    phone: '',
    appRole: '',
    quoteOfDay: false,
    parentGuardianEmail: '',
    profilePhotoUrl: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const age = useMemo(() => ageFromBirthday(form.birthday), [form.birthday]);
  const isMinor = PARENTAL_CONSENT_ENABLED && age !== null && age < 16;

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update('profilePhotoUrl', reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!form.appRole) {
      setError('Please select a role.');
      return;
    }
    if (isMinor && !form.parentGuardianEmail) {
      setError('A parent or guardian email is required for members under 16.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await signup(form);
      setResult(data);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <AuthLayout>
        <h1 className="text-xl font-bold text-navy mb-3">Thanks for signing up!</h1>
        <p className="text-navy/80">{result.message}</p>
        {result.requiresParentalConsent && (
          <p className="text-navy/60 text-sm mt-3">
            We've also emailed a parental consent request to the email you provided — your account
            can't be approved until that's confirmed.
          </p>
        )}
        <Link to="/login" className="inline-block mt-6 text-sm font-semibold text-[#38bdf8]">
          Back to login
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="text-xl font-bold text-navy mb-6 text-center">Create your account</h1>
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <input className="input" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required />
          </Field>
          <Field label="Last name" required>
            <input className="input" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required />
          </Field>
        </div>

        <Field label="Birthday" required>
          <input type="date" className="input" value={form.birthday} onChange={(e) => update('birthday', e.target.value)} required />
        </Field>

        <Field label="Email" required>
          <input type="email" className="input" value={form.email} onChange={(e) => update('email', e.target.value)} required />
        </Field>

        <Field label="Password" required hint="Minimum 8 characters">
          <input type="password" className="input" value={form.password} onChange={(e) => update('password', e.target.value)} required minLength={8} />
        </Field>

        <Field label="Phone number" >
          <input type="tel" className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </Field>

        <Field label="Profile photo">
          <input type="file" accept="image/*" onChange={handlePhoto} className="text-sm" />
        </Field>

        <Field label="Role" required>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={`border rounded-lg px-3 py-2 text-sm text-center cursor-pointer ${
                  form.appRole === r.value ? 'border-[#818cf8] bg-[#818cf8]/10 font-semibold' : 'border-[#e5e5e5]'
                }`}
              >
                <input
                  type="radio"
                  name="appRole"
                  value={r.value}
                  className="hidden"
                  checked={form.appRole === r.value}
                  onChange={() => update('appRole', r.value)}
                />
                {r.label}
              </label>
            ))}
          </div>
        </Field>

        {isMinor && (
          <Field label="Parent or guardian email" required hint="Required because you're under 16">
            <input
              type="email"
              className="input"
              value={form.parentGuardianEmail}
              onChange={(e) => update('parentGuardianEmail', e.target.value)}
              required
            />
          </Field>
        )}

        <label className="flex items-center gap-2 text-sm text-navy/80">
          <input type="checkbox" checked={form.quoteOfDay} onChange={(e) => update('quoteOfDay', e.target.checked)} />
          Send me a Quote of the Day
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg py-2.5 font-semibold text-white gradient-rainbow disabled:opacity-60"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="text-sm text-navy/60 text-center mt-4">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-[#38bdf8]">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-navy mb-1">
        {label}
        {required && <span className="text-rose-400"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-navy/50 mt-1">{hint}</p>}
    </div>
  );
}
