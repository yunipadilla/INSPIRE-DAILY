import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import InspireLogo from '../components/InspireLogo';
import BubbleBackground from '../components/BubbleBackground';
import ThemeToggle from '../components/ui/ThemeToggle';
import PasswordField from '../components/auth/PasswordField';
import Alert from '../components/ui/Alert';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const [params] = useSearchParams();
  // The link's destination is always this fixed route on this app's own
  // origin — there is no user-controllable redirect target anywhere in this
  // flow, so there's no open-redirect surface to guard against here.
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Set when the server says this link is invalid/expired/already used —
  // swaps the form for an explanation + a way to request a fresh link.
  const [linkDead, setLinkDead] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('This reset link is missing its token. Please request a new one.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      if (err.data?.code === 'INVALID_RESET_TOKEN') setLinkDead(true);
      else setError(err.data?.error || err.message);
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
          {done ? (
            <div className="space-y-5 text-center">
              <h1 className="bubble-heading text-2xl sm:text-3xl">Password updated!</h1>
              <Alert variant="success">
                Password updated successfully. You can now sign in with your new password.
              </Alert>
              <Link
                to="/login"
                className="btn-bubble gradient-rainbow text-white w-full py-3 min-h-[44px] flex items-center justify-center"
              >
                Go to sign in
              </Link>
            </div>
          ) : linkDead ? (
            <div className="space-y-5 text-center">
              <h1 className="bubble-heading text-2xl sm:text-3xl">This link can't be used</h1>
              <Alert variant="danger">
                This reset link has expired or was already used. Reset links last 60 minutes and only work once,
                and asking for a new link cancels the old one. Please request a new link.
              </Alert>
              <Link
                to="/forgot-password"
                className="btn-bubble gradient-rainbow text-white w-full py-3 min-h-[44px] flex items-center justify-center"
              >
                Request a new link
              </Link>
              <Link to="/login" className="block text-sm font-semibold text-link hover:opacity-80 transition-opacity">
                Back to sign in
              </Link>
            </div>
          ) : !token ? (
            <div className="space-y-5 text-center">
              <h1 className="bubble-heading text-2xl sm:text-3xl">Link missing its token</h1>
              <Alert variant="danger">
                This reset link looks incomplete. Please request a new one from the forgot-password page.
              </Alert>
              <Link
                to="/forgot-password"
                className="btn-bubble gradient-rainbow text-white w-full py-3 min-h-[44px] flex items-center justify-center"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-7">
                <h1 className="bubble-heading text-2xl sm:text-3xl leading-tight">Choose a new password</h1>
                <p className="text-sm text-ink-secondary mt-2 max-w-xs mx-auto">
                  Make it something you haven't used before.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-left" noValidate>
                <div className="rise-in stagger-3">
                  <PasswordField
                    label="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="rise-in stagger-3">
                  <PasswordField
                    label="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
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
                    {submitting ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
