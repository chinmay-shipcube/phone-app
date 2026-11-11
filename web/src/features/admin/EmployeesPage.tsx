import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus } from 'lucide-react';
import type { UserRow } from '../../../../shared/types';
import { api, errorText } from '../../api/client';
import { Badge, Button, Empty, ErrorNote, Field, Input, Sheet, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';

/** Staff accounts. The name is the login; a PIN is optional and can be set later. */
export function EmployeesPage() {
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const staff = users.data?.filter((u) => u.role === 'employee') ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand-900">Employees</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} /> Add employee
        </Button>
      </div>
      <p className="text-sm text-neutral-500">
        Each name appears as a button on the login screen. Without a PIN, anyone can tap that name, so a PIN is worth setting once
        commission depends on it.
      </p>
      {users.isLoading ? (
        <div className="flex justify-center py-10 text-brand-700">
          <Spinner />
        </div>
      ) : users.error ? (
        <ErrorNote>{errorText(users.error)}</ErrorNote>
      ) : staff.length ? (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {staff.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => setEditing(u)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className={`flex-1 font-semibold ${u.active ? 'text-ink' : 'text-neutral-400'}`}>{u.name}</span>
                {u.hasPin ? (
                  <Badge tone="brand">
                    <Lock size={12} className="mr-1" /> PIN
                  </Badge>
                ) : (
                  <Badge>No PIN</Badge>
                )}
                {!u.active ? <Badge tone="bad">Inactive</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No employees yet.</Empty>
      )}
      <EmployeeSheet user={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EmployeeSheet({ user, onClose }: { user: UserRow | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [loadedFor, setLoadedFor] = useState<UserRow | 'new' | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user && loadedFor !== user) {
    setLoadedFor(user);
    setName(user === 'new' ? '' : user.name);
    setPin('');
    setError('');
  }
  if (!user) return null;
  const isNew = user === 'new';

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      toast(message, 'good');
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['login-names'] });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const pinOk = pin === '' || /^\d{4,6}$/.test(pin);

  return (
    <Sheet open onClose={onClose} title={isNew ? 'Add employee' : user.name}>
      <div className="space-y-4">
        <Field label="Name" hint="Shown on the login screen and on every bill they print.">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} />
        </Field>
        <Field
          label={isNew ? 'PIN (optional)' : user.hasPin ? 'New PIN' : 'Set a PIN'}
          hint="4 to 6 digits. Leave empty for no PIN; the employee can also set one later."
          error={pinOk ? undefined : 'Use 4 to 6 digits.'}
        >
          <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" />
        </Field>
        <ErrorNote>{error}</ErrorNote>

        {isNew ? (
          <Button
            size="lg"
            className="w-full"
            disabled={busy || !name.trim() || !pinOk}
            onClick={() => run(() => api.post('/users', { name, pin: pin || null }), `${name} added.`)}
          >
            Add employee
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full"
              disabled={busy || !name.trim() || !pinOk || (name === user.name && !pin)}
              onClick={() => run(() => api.patch(`/users/${user.id}`, { name, ...(pin ? { pin } : {}) }), 'Saved.')}
            >
              Save
            </Button>
            {user.hasPin ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => run(() => api.patch(`/users/${user.id}`, { pin: null }), `${user.name}'s PIN removed.`)}
              >
                Remove PIN
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className={`w-full ${user.active ? '!text-red-600' : ''}`}
              disabled={busy}
              onClick={() =>
                run(
                  () => api.patch(`/users/${user.id}`, { active: !user.active }),
                  user.active ? `${user.name} deactivated.` : `${user.name} is active again.`,
                )
              }
            >
              {user.active ? 'Deactivate (they can no longer log in)' : 'Activate again'}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
