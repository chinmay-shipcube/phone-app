import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Me } from '../../../../shared/types';
import { api, errorText } from '../../api/client';
import { Button, ErrorNote, Field, Input, Sheet } from '../../components/ui';
import { useToast } from '../../components/Toast';

/** Employee sets, changes or removes their own PIN. */
export function ChangePinSheet({ me, open, onClose }: { me: Me; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setCurrent('');
    setNext('');
    setAgain('');
    setError('');
  };

  const save = async (newPin: string | null) => {
    if (newPin !== null && newPin !== again) return setError('The two PINs do not match.');
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ hasPin: boolean }>('/auth/pin', { currentPin: current || undefined, newPin });
      qc.setQueryData<Me | null>(['me'], (m) => (m ? { ...m, hasPin: r.hasPin } : m));
      qc.invalidateQueries({ queryKey: ['login-names'] });
      toast(r.hasPin ? 'PIN saved.' : 'PIN removed.', 'good');
      reset();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={me.hasPin ? 'Change your PIN' : 'Set a PIN'}
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">A PIN stops anyone else billing under your name. Use 4 to 6 digits.</p>
        {me.hasPin ? (
          <Field label="Current PIN">
            <Input type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(digits(e.target.value))} />
          </Field>
        ) : null}
        <Field label="New PIN">
          <Input type="password" inputMode="numeric" value={next} onChange={(e) => setNext(digits(e.target.value))} />
        </Field>
        <Field label="New PIN again">
          <Input type="password" inputMode="numeric" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button className="w-full" size="lg" onClick={() => save(next)} disabled={busy || next.length < 4 || (me.hasPin && !current)}>
          Save PIN
        </Button>
        {me.hasPin ? (
          <Button variant="ghost" className="w-full" onClick={() => save(null)} disabled={busy || !current}>
            Remove my PIN
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
