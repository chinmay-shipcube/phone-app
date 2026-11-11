import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HelpCircle, Printer } from 'lucide-react';
import type { BillDetail, CreateBillResponse, PrintResult } from '../../../../shared/types';
import { api, errorText } from '../../api/client';
import { formatINR } from '../../lib/format';
import { Button, ErrorNote, Sheet } from '../../components/ui';

/** What happened at the printer, right after Print bill. The bill itself is already saved. */
export function PrintResultSheet({ result, onClose }: { result: CreateBillResponse | null; onClose: () => void }) {
  const [override, setOverride] = useState<PrintResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qc = useQueryClient();
  if (!result) return null;

  const print = override ?? result.print;
  const bill = result.bill;

  const reprint = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ print: PrintResult; bill: BillDetail }>(`/bills/${bill.id}/reprint`);
      setOverride(r.print);
      qc.invalidateQueries({ queryKey: ['bills'] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOverride(null);
    setError('');
    onClose();
  };

  let icon = <CheckCircle2 size={44} className="text-emerald-600" />;
  let title = 'Bill printed';
  let text = 'Hand the slip to the customer.';
  if (!print) {
    icon = <HelpCircle size={44} className="text-amber-600" />;
    title = 'Already saved';
    text = 'This bill was saved a moment ago and sent to the printer then. Check the printer before reprinting.';
  } else if (print.status === 'unknown') {
    icon = <HelpCircle size={44} className="text-amber-600" />;
    title = 'Check the printer';
    text = `The printer did not answer in time. Look whether the slip came out. Only if it did not, tap Reprint. ${print.error ?? ''}`;
  } else if (print.status === 'failed') {
    icon = <AlertTriangle size={44} className="text-red-600" />;
    title = 'Saved, but not printed';
    text = print.error || 'The printer did not print. Check paper and power, then tap Reprint.';
  }

  return (
    <Sheet
      open
      onClose={close}
      title={bill.invoiceNo}
      footer={
        <div className="flex gap-2 pb-1">
          {print?.status !== 'printed' ? (
            <Button variant="secondary" size="lg" className="flex-1" onClick={reprint} disabled={busy}>
              <Printer size={18} /> {busy ? 'Printing…' : 'Reprint'}
            </Button>
          ) : null}
          <Button size="lg" className="flex-1" onClick={close}>
            New bill
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center">
        {icon}
        <p className="mt-3 text-xl font-bold text-brand-900">{title}</p>
        <p className="mt-1 text-sm text-neutral-600">{text}</p>
        <p className="tabular mt-4 text-3xl font-black text-ink">{formatINR(bill.totalPaise)}</p>
        <p className="mt-1 text-sm text-neutral-500">
          {bill.lines.length} line{bill.lines.length === 1 ? '' : 's'} · {bill.paymentMode.toUpperCase()}
        </p>
        {error ? (
          <div className="mt-3 w-full">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
