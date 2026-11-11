import { useState } from 'react';
import { api, errorText } from '../../api/client';
import { Button, ErrorNote, Field, Input, Sheet } from '../../components/ui';
import { useToast } from '../../components/Toast';

export function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setCurrent('');
    setNext('');
    setAgain('');
    setError('');
    onClose();
  };

  const save = async () => {
    if (next !== again) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/password', { currentPassword: current, newPassword: next });
      toast('Password changed. Other admin logins were signed out.', 'good');
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title="Change admin password">
      <div className="space-y-4">
        <Field label="Current password">
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="New password again">
          <Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button className="w-full" size="lg" onClick={save} disabled={busy || !current || next.length < 8}>
          Save password
        </Button>
      </div>
    </Sheet>
  );
}
