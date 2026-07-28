import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import InspireLogo from '../components/InspireLogo';
import BubbleBackground from '../components/BubbleBackground';
import ThemeToggle from '../components/ui/ThemeToggle';
import Alert from '../components/ui/Alert';
import { useAuth } from '../context/AuthContext';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const emailId = useId();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await forgotPassword(email);
      // The server always returns the same message regardless of whether
      // the email exists — that's intentional (enumeration-safe), not a bug.
      setResult(data.message);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bubble-page-bg bubble-page-bg--full flex flex-col items-center justify-center px-4 py-10">
      <BubbleBackground />
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <div className="rise-in stagger-1 mb-6">
          <InspireLogo size={44} />
        </div>

        <div className="rise-in stagger-2 bubble-card w-full p-7 sm:p-9">
          <div className="text-center mb-7">
            <h1 className="bubble-heading text-2xl sm:text-3xl leading-tight">Forgot your password?</h1>
            <p className="text-sm text-ink-secondary mt-2 max-w-xs mx-auto">
              No worries — enter your email and we'll send you a link to reset it.
            </p>
          </div>

          {result ? (
            <div className="space-y-5">
              <Alert variant="success">{result}</Alert>
              <Link
                to="/login"
                className="btn-bubble gradient-rainbow text-white w-full py-3 min-h-[44px] flex items-center justify-center"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-left" noValidate>
              <div className="rise-in stagger-3">
                <label htmlFor={emailId} className="block text-sm font-medium text-navy mb-1.5">
                  Email
                </label>
                <input
                  id={emailId}
                  type="email"
                  className="input-bubble"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-danger rise-in">
                  {error}
                </p>
              )}

              <div className="rise-in stagger-4 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-bubble gradient-rainbow text-white w-full py-3 min-h-[44px]"
                >
                  {submitting ? 'Sending…' : 'Send reset link'}
                </button>
              </div>
            </form>
          )}

          <p className="rise-in stagger-4 text-sm text-ink-secondary text-center mt-6">
            Remembered it?{' '}
            <Link to="/login" className="font-semibold text-blue hover:opacity-80 transition-opacity">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
