import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { apiFetch } from '../lib/api';

export default function ParentalConsent() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing consent token.');
      return;
    }
    apiFetch('/auth/parental-consent/confirm', { method: 'POST', body: { token } })
      .then((data) => {
        setStatus('success');
        setMessage(data.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.data?.error || err.message);
      });
  }, [token]);

  return (
    <AuthLayout>
      <h1 className="text-xl font-bold text-navy mb-3 text-center">Parental Consent</h1>
      <p className="text-center text-navy/80">
        {status === 'pending' ? 'Confirming…' : message}
      </p>
    </AuthLayout>
  );
}
