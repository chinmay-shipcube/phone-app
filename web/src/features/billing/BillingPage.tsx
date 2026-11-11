import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Minus, Plus, Printer, Trash2 } from 'lucide-react';
import { PAYMENT_MODES, type CreateBillResponse, type Item, type PaymentMode } from '../../../../shared/types';
import { BillMathError, computeBill, type BillTotals } from '../../../../shared/gst';
import { gstinError } from '../../../../shared/gstin';
import { api, errorText } from '../../api/client';
import { usePublicSettings } from '../../lib/auth';
import { formatINR, modeLabel, newRequestId, rupeesToPaise } from '../../lib/format';
import { Badge, Button, ErrorNote, Field, Input } from '../../components/ui';
import { ItemEntry, type NewLine } from './ItemEntry';
import { PrintResultSheet } from './PrintResultSheet';

interface CartLine extends NewLine {
  key: string;
}

export function BillingPage() {
  const qc = useQueryClient();
  const settings = usePublicSettings();
  const items = useQuery({ queryKey: ['items'], queryFn: () => api.get<Item[]>('/items'), staleTime: 5 * 60_000 });
  const itemById = useMemo(() => new Map((items.data ?? []).map((i) => [i.id, i])), [items.data]);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [discountText, setDiscountText] = useState('');
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [showCustomer, setShowCustomer] = useState(false);
  const [customer, setCustomer] = useState({ name: '', phone: '', gstin: '' });
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateBillResponse | null>(null);

  const defaultGst = settings.data?.defaultGstBp ?? 1800;
  const discountPaise = discountText.trim() ? rupeesToPaise(discountText) : 0;
  const gstinErr = gstinError(customer.gstin);

  // Live preview with the same maths the server uses.
  const preview: { totals: BillTotals | null; problem: string } = useMemo(() => {
    if (!lines.length) return { totals: null, problem: '' };
    const bad = lines.find((l) => rupeesToPaise(l.rateText) === null);
    if (bad) return { totals: null, problem: `Check the rate of "${bad.name}".` };
    if (discountPaise === null) return { totals: null, problem: 'Check the discount amount.' };
    try {
      const totals = computeBill(
        lines.map((l) => ({
          qty: l.qty,
          ratePaise: rupeesToPaise(l.rateText)!,
          gstBp: l.itemId !== null ? (itemById.get(l.itemId)?.gstBp ?? defaultGst) : defaultGst,
        })),
        discountPaise,
      );
      return { totals, problem: '' };
    } catch (e) {
      return { totals: null, problem: e instanceof BillMathError ? e.message : 'Check the bill.' };
    }
  }, [lines, discountPaise, itemById, defaultGst]);

  const addLine = (l: NewLine) => {
    setError('');
    setLines((ls) => {
      // Same item at the same rate: add to its quantity instead of a second line.
      const same = ls.find((x) => x.itemId !== null && x.itemId === l.itemId && rupeesToPaise(x.rateText) === rupeesToPaise(l.rateText));
      if (same) return ls.map((x) => (x === same ? { ...x, qty: Math.min(9999, x.qty + l.qty) } : x));
      return [...ls, { ...l, key: newRequestId() }];
    });
  };
  const update = (key: string, patch: Partial<CartLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const clearBill = () => {
    setLines([]);
    setDiscountText('');
    setMode('cash');
    setCustomer({ name: '', phone: '', gstin: '' });
    setShowCustomer(false);
    setRequestId(newRequestId());
    setError('');
  };

  const printBill = async () => {
    if (!preview.totals || gstinErr) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.post<CreateBillResponse>('/bills', {
        clientRequestId: requestId,
        lines: lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, ratePaise: rupeesToPaise(l.rateText) })),
        discountPaise: discountPaise ?? 0,
        paymentMode: mode,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerGstin: customer.gstin,
      });
      setResult(r);
      clearBill(); // the bill is saved; a new request id is ready for the next one
      qc.invalidateQueries({ queryKey: ['bills'] });
    } catch (e) {
      // Not saved, or not sure: keep the cart and the same request id so a retry cannot double-bill.
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const t = preview.totals;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-4">
      <ItemEntry items={items.data ?? []} allowCustom={settings.data?.allowCustomItems ?? true} onAdd={addLine} />
      {items.error ? (
        <div className="mt-2">
          <ErrorNote>{errorText(items.error)}</ErrorNote>
        </div>
      ) : null}

      {lines.length ? (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-brand-800">Bill</h2>
            <button type="button" className="text-sm font-medium text-neutral-500" onClick={() => setLines([])}>
              Clear all
            </button>
          </div>
          <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
            {lines.map((l, idx) => {
              const rate = rupeesToPaise(l.rateText);
              return (
                <li key={l.key} className="p-3">
                  <div className="flex items-start gap-2">
                    <span className="tabular mt-0.5 w-5 shrink-0 text-sm text-neutral-400">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug text-ink">{l.name}</p>
                      {l.itemId === null ? <Badge tone="warn">Unlisted</Badge> : null}
                    </div>
                    <span className="tabular shrink-0 font-semibold text-ink">{rate !== null ? formatINR(rate * l.qty) : '—'}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-7">
                    <div className="flex h-10 items-center rounded-lg border border-neutral-300">
                      <button
                        type="button"
                        className="h-full px-2 text-brand-700 disabled:text-neutral-300"
                        disabled={l.qty <= 1}
                        onClick={() => update(l.key, { qty: l.qty - 1 })}
                        aria-label="Less"
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        value={l.qty}
                        inputMode="numeric"
                        onChange={(e) =>
                          update(l.key, { qty: Math.max(1, Math.min(9999, Number(e.target.value.replace(/\D/g, '')) || 1)) })
                        }
                        className="tabular w-9 bg-transparent text-center font-semibold focus:outline-none"
                        aria-label={`Quantity of ${l.name}`}
                      />
                      <button
                        type="button"
                        className="h-full px-2 text-brand-700"
                        onClick={() => update(l.key, { qty: Math.min(9999, l.qty + 1) })}
                        aria-label="More"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <span className="text-sm text-neutral-400">×</span>
                    <div className="relative min-w-0 flex-1">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">₹</span>
                      <input
                        value={l.rateText}
                        inputMode="decimal"
                        onChange={(e) => update(l.key, { rateText: e.target.value })}
                        className={`tabular h-10 w-full rounded-lg border bg-white pl-6 pr-2 text-right font-medium focus:outline-none focus:ring-2 focus:ring-brand-100 ${
                          rate === null ? 'border-red-400' : 'border-neutral-300 focus:border-brand-600'
                        }`}
                        aria-label={`Rate of ${l.name}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(l.key)}
                      className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${l.name}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 space-y-4">
            <div>
              <span className="mb-1 block text-sm font-medium text-neutral-700">Payment</span>
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-neutral-100 p-1">
                {PAYMENT_MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`h-10 rounded-lg text-sm font-semibold ${mode === m ? 'bg-brand-700 text-white shadow' : 'text-neutral-600'}`}
                  >
                    {modeLabel[m]}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Discount (₹)" error={discountPaise === null ? 'Enter an amount like 50 or 49.50.' : undefined}>
              <Input
                value={discountText}
                onChange={(e) => setDiscountText(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="tabular"
              />
            </Field>

            <div className="rounded-2xl border border-neutral-200">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-700"
                onClick={() => setShowCustomer((s) => !s)}
              >
                <span>
                  Customer details <span className="text-neutral-400">(optional)</span>
                  {customer.name ? <span className="ml-1 text-brand-700">· {customer.name}</span> : null}
                </span>
                <ChevronDown size={18} className={`transition-transform ${showCustomer ? 'rotate-180' : ''}`} />
              </button>
              {showCustomer ? (
                <div className="space-y-3 border-t border-neutral-100 px-4 pb-4 pt-3">
                  <Field label="Name">
                    <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} autoComplete="off" />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      inputMode="tel"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="GSTIN" hint="Only for business customers who need a tax invoice." error={gstinErr || undefined}>
                    <Input
                      value={customer.gstin}
                      onChange={(e) => setCustomer({ ...customer, gstin: e.target.value.toUpperCase() })}
                      autoCapitalize="characters"
                      autoComplete="off"
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            {t ? (
              <dl className="tabular space-y-1.5 rounded-2xl bg-brand-50 px-4 py-3 text-sm">
                <Row label={`Items (${lines.reduce((a, l) => a + l.qty, 0)})`} value={formatINR(t.grossPaise)} />
                {t.discountPaise ? <Row label="Discount" value={`−${formatINR(t.discountPaise)}`} /> : null}
                <Row label="Taxable value" value={formatINR(t.taxablePaise)} muted />
                <Row label="CGST" value={formatINR(t.cgstPaise)} muted />
                <Row label="SGST" value={formatINR(t.sgstPaise)} muted />
              </dl>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="mt-10 text-center text-sm text-neutral-500">
          Search an item above and tap Add. Each item becomes a line on the bill.
        </p>
      )}

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          {error || preview.problem ? (
            <div className="mb-2">
              <ErrorNote>{error || preview.problem}</ErrorNote>
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Total</p>
              <p className="tabular truncate text-2xl font-black text-brand-900">{formatINR(t?.totalPaise ?? 0)}</p>
            </div>
            <Button size="lg" onClick={printBill} disabled={!t || busy || !!gstinErr} className="min-w-40">
              <Printer size={20} /> {busy ? 'Printing…' : 'Print bill'}
            </Button>
          </div>
        </div>
      </div>

      <PrintResultSheet result={result} onClose={() => setResult(null)} />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? 'text-neutral-500' : 'font-medium text-ink'}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
