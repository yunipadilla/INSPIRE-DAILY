import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import InspireLogo from '../components/InspireLogo';
import BubbleBackground from '../components/BubbleBackground';
import PasswordField from '../components/auth/PasswordField';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const emailId = useId();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/app');
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bubble-page-bg bubble-page-bg--full flex flex-col items-center justify-center px-4 py-10">
      <BubbleBackground />

      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <div className="rise-in stagger-1 mb-6">
          <InspireLogo size={44} />
        </div>

        <div className="rise-in stagger-2 bubble-card w-full p-7 sm:p-9">
          <div className="text-center mb-7">
            <h1 className="bubble-heading text-3xl sm:text-[2.25rem] leading-tight">Welcome Back!</h1>
            <p className="text-sm text-navy/55 mt-2 max-w-xs mx-auto">
              Your daily space to reflect, grow, and feel inspired.
            </p>
          </div>

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

            <div className="rise-in stagger-3">
              <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>

            {error && (
              <p role="alert" className="text-sm text-rose-500 rise-in">
                {error}
              </p>
            )}

            <div className="rise-in stagger-4 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="btn-bubble gradient-rainbow text-white w-full py-3 min-h-[44px]"
              >
                {submitting ? 'Logging in…' : 'Log in'}
              </button>
            </div>
          </form>

          <p className="rise-in stagger-4 text-sm text-navy/55 text-center mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-[#38bdf8] hover:text-[#0ea5e9] transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
