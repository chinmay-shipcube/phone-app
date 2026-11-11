import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import type { LoginName, Me } from '../../../../shared/types';
import { api, errorText } from '../../api/client';
import { Logo } from '../../components/Logo';
import { PinPad } from '../../components/PinPad';
import { ErrorNote, Spinner } from '../../components/ui';

/** "Who's billing?" Tap your name; enter your PIN if you set one. */
export function LoginPage() {
  const qc = useQueryClient();
  const names = useQuery({
    queryKey: ['login-names'],
    queryFn: () => api.get<{ names: LoginName[]; adminExists: boolean }>('/auth/names'),
  });
  const [picked, setPicked] = useState<LoginName | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(
    async (who: LoginName, pin?: string) => {
      setBusy(true);
      setError('');
      try {
        const me = await api.post<Me>('/auth/login', { userId: who.id, pin });
        qc.setQueryData(['me'], me);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [qc],
  );

  const choose = (n: LoginName) => {
    setError('');
    if (n.hasPin) setPicked(n);
    else void login(n);
  };

  const onPin = useCallback((pin: string) => picked && login(picked, pin), [picked, login]);

  return (
    <div className="safe-top flex min-h-dvh flex-col bg-white">
      <header className="flex justify-center px-6 pb-4 pt-10">
        <Logo size={48} />
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5">
        {picked ? (
          <div className="pt-4">
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-brand-700"
            >
              <ArrowLeft size={16} /> Not {picked.name}?
            </button>
            <h1 className="mb-1 text-center text-2xl font-bold text-brand-900">Hi {picked.name}</h1>
            <p className="mb-6 text-center text-sm text-neutral-500">Enter your PIN</p>
            <ErrorNote>{error}</ErrorNote>
            <div className="mt-4">
              <PinPad onSubmit={onPin} busy={busy} />
            </div>
          </div>
        ) : (
          <div className="pt-4">
            <h1 className="mb-1 text-center text-2xl font-bold text-brand-900">Who's billing?</h1>
            <p className="mb-6 text-center text-sm text-neutral-500">Tap your name to start</p>
            <ErrorNote>{error || (names.error ? errorText(names.error) : '')}</ErrorNote>
            {names.isLoading ? (
              <div className="flex justify-center py-10 text-brand-700">
                <Spinner />
              </div>
            ) : names.data?.names.length ? (
              <div className="mt-2 grid grid-cols-2 gap-3">
                {names.data.names.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    disabled={busy}
                    onClick={() => choose(n)}
                    className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-brand-100 bg-brand-50 px-2 text-lg font-semibold text-brand-900 active:bg-brand-100 disabled:opacity-60"
                  >
                    <span className="max-w-full truncate">{n.name}</span>
                    {n.hasPin ? <Lock size={14} className="text-brand-500" aria-label="PIN" /> : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-brand-50 px-4 py-6 text-center text-sm text-brand-800">
                No employees yet. The admin adds them under Admin → Employees.
              </p>
            )}
          </div>
        )}
      </main>

      <footer className="safe-bottom flex justify-center px-6 pb-6 pt-8">
        <Link to="/admin-login" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-brand-700">
          <ShieldCheck size={16} /> Want admin privileges?
        </Link>
      </footer>
    </div>
  );
}
