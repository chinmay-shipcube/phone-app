import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Printer } from 'lucide-react';
import type { BillDetail, PrintResult } from '../../../../shared/types';
import { api, errorText } from '../../api/client';
import { fmtDateTime, formatINR, modeLabel, pct } from '../../lib/format';
import { Badge, Button, ErrorNote, Field, Input, Sheet, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';

const printTone = { printed: 'good', failed: 'bad', unknown: 'warn', pending: 'neutral' } as const;
const printLabel = { printed: 'Printed', failed: 'Failed', unknown: 'Not sure', pending: 'Printing' } as const;

/** One bill: lines, GST, print history. Reprint for its owner or the admin; void for the admin. */
export function BillDetailSheet({ billId, onClose, canVoid }: { billId: number | null; onClose: () => void; canVoid?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['bills', 'detail', billId],
    queryFn: () => api.get<BillDetail>(`/bills/${billId}`),
    enabled: billId !== null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');

  if (billId === null) return null;
  const b = q.data;

  const reprint = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ print: PrintResult }>(`/bills/${billId}/reprint`);
      if (r.print.status === 'printed') toast('Sent to the printer.', 'good');
      else setError(r.print.error || 'The printer did not print.');
      qc.invalidateQueries({ queryKey: ['bills'] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const doVoid = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/bills/${billId}/void`, { reason });
      toast('Bill voided.', 'good');
      setVoiding(false);
      setReason('');
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setVoiding(false);
    setError('');
    onClose();
  };

  return (
    <Sheet
      open
      onClose={close}
      title={b?.invoiceNo ?? 'Bill'}
      footer={
        b && b.status === 'completed' ? (
          voiding ? (
            <div className="space-y-3 pb-1">
              <Field label="Why is this bill being voided?">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. customer returned the item" autoFocus />
              </Field>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setVoiding(false)}>
                  Cancel
                </Button>
                <Button variant="danger" className="flex-1" onClick={doVoid} disabled={busy || reason.trim().length < 3}>
                  Void bill
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pb-1">
              {canVoid ? (
                <Button variant="secondary" className="flex-1 !text-red-600" onClick={() => setVoiding(true)}>
                  <Ban size={18} /> Void
                </Button>
              ) : null}
              <Button className="flex-1" onClick={reprint} disabled={busy}>
                <Printer size={18} /> {busy ? 'Printing…' : 'Reprint'}
              </Button>
            </div>
          )
        ) : undefined
      }
    >
      {q.isLoading || !b ? (
        <div className="flex justify-center py-10 text-brand-700">
          {q.error ? <ErrorNote>{errorText(q.error)}</ErrorNote> : <Spinner />}
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {b.status === 'voided' ? <Badge tone="bad">Voided</Badge> : <Badge tone="good">Completed</Badge>}
            <span className="text-neutral-500">{fmtDateTime(b.createdAt)}</span>
            <span className="text-neutral-500">· by {b.employeeName}</span>
            <span className="text-neutral-500">· {modeLabel[b.paymentMode]}</span>
          </div>
          {b.status === 'voided' ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">
              Voided by {b.voidedByName} {b.voidedAt ? `on ${fmtDateTime(b.voidedAt)}` : ''}: {b.voidReason}
            </p>
          ) : null}
          {b.customerName || b.customerPhone || b.customerGstin ? (
            <p className="text-neutral-600">Customer: {[b.customerName, b.customerPhone, b.customerGstin].filter(Boolean).join(' · ')}</p>
          ) : null}

          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {b.lines.map((l) => (
              <li key={l.lineNo} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {l.name} {l.custom ? <Badge tone="warn">Unlisted</Badge> : null}
                  </p>
                  <p className="tabular text-xs text-neutral-500">
                    {l.qty} × {formatINR(l.ratePaise)} · GST {pct(l.gstBp)}
                    {l.hsn ? ` · HSN ${l.hsn}` : ''}
                  </p>
                </div>
                <span className="tabular shrink-0 font-semibold">{formatINR(l.grossPaise)}</span>
              </li>
            ))}
          </ul>

          <dl className="tabular space-y-1 rounded-xl bg-brand-50 px-3 py-2.5">
            {b.discountPaise ? (
              <>
                <Line label="Subtotal" value={formatINR(b.grossPaise)} />
                <Line label="Discount" value={`−${formatINR(b.discountPaise)}`} />
              </>
            ) : null}
            <Line label="Taxable value" value={formatINR(b.taxablePaise)} muted />
            <Line label="CGST + SGST" value={`${formatINR(b.cgstPaise)} + ${formatINR(b.sgstPaise)}`} muted />
            <div className="flex justify-between pt-1 text-base font-bold text-brand-900">
              <dt>Total</dt>
              <dd>{formatINR(b.totalPaise)}</dd>
            </div>
          </dl>

          <div>
            <p className="mb-1 font-semibold text-neutral-700">Prints</p>
            {b.prints.length ? (
              <ul className="space-y-1">
                {b.prints.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 text-neutral-600">
                    <Badge tone={printTone[p.status]}>{printLabel[p.status]}</Badge>
                    <span>{p.kind === 'copy' ? 'Copy' : 'Original'}</span>
                    <span>· {fmtDateTime(p.createdAt)}</span>
                    <span>· {p.requestedByName}</span>
                    {p.error ? <span className="w-full text-xs text-red-600">{p.error}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-neutral-500">Not printed yet.</p>
            )}
          </div>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Sheet>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-neutral-500' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
