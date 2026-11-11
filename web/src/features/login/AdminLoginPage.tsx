import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { Me } from '../../../../shared/types';
import { api, errorText } from '../../api/client';
import { Logo } from '../../components/Logo';
import { Button, ErrorNote, Field, Input } from '../../components/ui';

export function AdminLoginPage() {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await api.post<Me>('/auth/admin-login', { password });
      qc.setQueryData(['me'], me);
    } catch (err) {
      setError(errorText(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="safe-top flex min-h-dvh flex-col bg-white">
      <div className="mx-auto w-full max-w-sm flex-1 px-5 pt-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
          <ArrowLeft size={16} /> Back to staff login
        </Link>
        <div className="mt-10 flex justify-center">
          <Logo size={44} />
        </div>
        <h1 className="mt-8 text-center text-2xl font-bold text-brand-900">Admin login</h1>
        <p className="mt-1 text-center text-sm text-neutral-500">Reports, items, employees and settings</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !password}>
            {busy ? 'Checking…' : 'Log in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
