import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';

/** Big number pad for 4-6 digit PINs. Submits on its own at maxLength. */
export function PinPad({
  onSubmit,
  busy,
  maxLength = 6,
  minLength = 4,
}: {
  onSubmit: (pin: string) => void;
  busy?: boolean;
  maxLength?: number;
  minLength?: number;
}) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (pin.length === maxLength) {
      onSubmit(pin);
      setPin('');
    }
  }, [pin, maxLength, onSubmit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < maxLength ? p + e.key : p));
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      if (e.key === 'Enter' && pin.length >= minLength) {
        onSubmit(pin);
        setPin('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, maxLength, minLength, onSubmit, pin]);

  const press = (d: string) => !busy && setPin((p) => (p.length < maxLength ? p + d : p));
  const key = 'h-16 rounded-2xl text-2xl font-semibold text-brand-900 bg-brand-50 active:bg-brand-100 disabled:opacity-50';

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-6 flex justify-center gap-3" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-brand-700' : 'bg-neutral-200'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} disabled={busy}>
            {d}
          </button>
        ))}
        <button
          type="button"
          className="h-16 rounded-2xl text-base font-semibold text-white bg-brand-700 active:bg-brand-800 disabled:opacity-40"
          disabled={busy || pin.length < minLength}
          onClick={() => {
            onSubmit(pin);
            setPin('');
          }}
        >
          OK
        </button>
        <button type="button" className={key} onClick={() => press('0')} disabled={busy}>
          0
        </button>
        <button
          type="button"
          className={`${key} flex items-center justify-center`}
          onClick={() => setPin((p) => p.slice(0, -1))}
          disabled={busy}
          aria-label="Delete"
        >
          <Delete />
        </button>
      </div>
    </div>
  );
}
