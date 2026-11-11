import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BillSummary } from '../../../../shared/types';
import { api, errorText, qs } from '../../api/client';
import { fmtTime, formatINR, today } from '../../lib/format';
import { Badge, Empty, ErrorNote, Spinner } from '../../components/ui';
import { BillDetailSheet } from './BillDetailSheet';

/** Today's bills by the logged-in employee, to check or reprint one. */
export function MyBillsPage() {
  const day = today();
  const q = useQuery({
    queryKey: ['bills', 'mine', day],
    queryFn: () => api.get<{ bills: BillSummary[]; total: number }>(`/bills${qs({ from: day, to: day, limit: 200 })}`),
    refetchInterval: 15_000,
  });
  const [open, setOpen] = useState<number | null>(null);
  const done = q.data?.bills.filter((b) => b.status === 'completed') ?? [];
  const total = done.reduce((a, b) => a + b.totalPaise, 0);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-4">
      <div className="mb-4 rounded-2xl bg-brand-900 px-4 py-4 text-white">
        <p className="text-sm text-brand-200">Your sales today</p>
        <p className="tabular text-3xl font-black">{formatINR(total)}</p>
        <p className="text-sm text-brand-200">
          {done.length} bill{done.length === 1 ? '' : 's'}
        </p>
      </div>
      {q.isLoading ? (
        <div className="flex justify-center py-10 text-brand-700">
          <Spinner />
        </div>
      ) : q.error ? (
        <ErrorNote>{errorText(q.error)}</ErrorNote>
      ) : q.data?.bills.length ? (
        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
          {q.data.bills.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setOpen(b.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-brand-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{b.invoiceNo}</p>
                  <p className="text-xs text-neutral-500">
                    {fmtTime(b.createdAt)} · {b.itemCount} line{b.itemCount === 1 ? '' : 's'}
                    {b.customerName ? ` · ${b.customerName}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`tabular font-semibold ${b.status === 'voided' ? 'text-neutral-400 line-through' : 'text-ink'}`}>
                    {formatINR(b.totalPaise)}
                  </p>
                  {b.status === 'voided' ? (
                    <Badge tone="bad">Voided</Badge>
                  ) : b.lastPrintStatus && b.lastPrintStatus !== 'printed' ? (
                    <Badge tone={b.lastPrintStatus === 'failed' ? 'bad' : 'warn'}>
                      {b.lastPrintStatus === 'failed' ? 'Not printed' : 'Check print'}
                    </Badge>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No bills yet today.</Empty>
      )}
      <BillDetailSheet billId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
