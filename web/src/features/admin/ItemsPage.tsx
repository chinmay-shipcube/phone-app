import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import type { Item, ItemSalesRow, PublicSettings } from '../../../../shared/types';
import { matchItems } from '../../../../shared/search';
import { api, errorText, qs } from '../../api/client';
import { usePublicSettings } from '../../lib/auth';
import { daysAgo, formatINR, paiseToRupees, pct, rupeesToPaise, today } from '../../lib/format';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Select, Sheet, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';

const GST_RATES = [0, 500, 1200, 1800, 2800];

/** The item list staff search while billing. Only active items show up for them. */
export function ItemsPage() {
  usePublicSettings(); // default GST rate and HSN for new items
  const items = useQuery({ queryKey: ['items', 'all'], queryFn: () => api.get<Item[]>(`/items${qs({ all: 1 })}`) });
  const unlisted = useQuery({
    queryKey: ['reports', 'items', 'unlisted'],
    queryFn: () => api.get<ItemSalesRow[]>(`/reports/items${qs({ from: daysAgo(30), to: today() })}`),
    select: (rows) => rows.filter((r) => r.custom),
  });
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<Item> | null>(null);

  const shown = useMemo(() => {
    const all = items.data ?? [];
    return q.trim() ? matchItems(q, all, 500) : all;
  }, [items.data, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-brand-900">Items</h1>
        <Button onClick={() => setEditing({})}>
          <Plus size={18} /> Add item
        </Button>
      </div>

      {unlisted.data?.length ? (
        <Card className="border-amber-200 bg-amber-50/50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-900">
            Sold as unlisted in the last 30 days. Add them to the list so staff can pick them.
          </p>
          <div className="flex flex-wrap gap-2">
            {unlisted.data.slice(0, 12).map((u) => (
              <button
                key={u.name}
                type="button"
                onClick={() => setEditing({ name: u.name, defaultPricePaise: u.qty ? Math.round(u.salesPaise / u.qty) : null })}
                className="rounded-full border border-amber-300 bg-white px-3 py-1 text-sm font-medium text-amber-900"
              >
                + {u.name} <span className="text-amber-700">({u.qty})</span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" className="pl-10" />
      </div>

      {items.isLoading ? (
        <div className="flex justify-center py-10 text-brand-700">
          <Spinner />
        </div>
      ) : items.error ? (
        <ErrorNote>{errorText(items.error)}</ErrorNote>
      ) : shown.length ? (
        <>
          <p className="text-sm text-neutral-500">
            {shown.length} of {items.data?.length} items
          </p>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {shown.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setEditing(i)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${i.active ? 'text-ink' : 'text-neutral-400'}`}>
                      {i.name} {!i.active ? <Badge>Hidden</Badge> : null}
                    </p>
                    <p className="text-xs text-neutral-500">
                      GST {pct(i.gstBp)}
                      {i.hsn ? ` · HSN ${i.hsn}` : ''}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-sm font-semibold text-ink">
                    {i.defaultPricePaise !== null ? (
                      formatINR(i.defaultPricePaise, { short: true })
                    ) : (
                      <span className="font-normal text-neutral-400">No default</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty>{q ? 'No item matches.' : 'No items yet. Tap Add item to create the first one.'}</Empty>
      )}

      <ItemSheet item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ItemSheet({ item, onClose }: { item: Partial<Item> | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const defaults = qc.getQueryData<PublicSettings>(['settings', 'public']);
  const isNew = !item?.id;
  const [form, setForm] = useState({ name: '', price: '', hsn: '', gstBp: 1800, active: true });
  const [loadedFor, setLoadedFor] = useState<Partial<Item> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (item && loadedFor !== item) {
    setLoadedFor(item);
    setError('');
    setForm({
      name: item.name ?? '',
      price: item.defaultPricePaise != null ? paiseToRupees(item.defaultPricePaise).replace(/\.00$/, '') : '',
      hsn: item.hsn ?? defaults?.defaultHsn ?? '',
      gstBp: item.gstBp ?? defaults?.defaultGstBp ?? 1800,
      active: item.active ?? true,
    });
  }
  if (!item) return null;

  const pricePaise = form.price.trim() ? rupeesToPaise(form.price) : null;
  const priceBad = !!form.price.trim() && pricePaise === null;

  const save = async () => {
    setBusy(true);
    setError('');
    const body = { name: form.name, defaultPricePaise: pricePaise, hsn: form.hsn, gstBp: form.gstBp, active: form.active };
    try {
      if (isNew) await api.post('/items', body);
      else await api.patch(`/items/${item.id}`, body);
      toast(isNew ? `${form.name} added.` : 'Item saved.', 'good');
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['reports', 'items', 'unlisted'] });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Add item' : 'Edit item'}
      footer={
        <Button size="lg" className="mb-1 w-full" onClick={save} disabled={busy || !form.name.trim() || priceBad}>
          {busy ? 'Saving…' : isNew ? 'Add item' : 'Save'}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Name" hint="As staff will search it and as it prints on the slip, e.g. iPhone 16 Cover. English only.">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus={isNew} />
        </Field>
        <Field
          label="Default rate (₹, incl. GST)"
          hint="Optional. Staff can change it on each bill."
          error={priceBad ? 'Enter an amount like 299 or 299.50.' : undefined}
        >
          <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" className="tabular" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GST rate">
            <Select value={form.gstBp} onChange={(e) => setForm({ ...form, gstBp: Number(e.target.value) })}>
              {[...new Set([...GST_RATES, form.gstBp])]
                .sort((a, b) => a - b)
                .map((r) => (
                  <option key={r} value={r}>
                    {pct(r)}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="HSN code">
            <Input
              value={form.hsn}
              onChange={(e) => setForm({ ...form, hsn: e.target.value.replace(/\D/g, '').slice(0, 8) })}
              inputMode="numeric"
            />
          </Field>
        </div>
        {!isNew ? (
          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-3 py-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-700"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span className="text-sm">
              <span className="font-medium">Show to staff</span>
              <span className="block text-neutral-500">Untick to hide an item you no longer sell. Old bills keep it.</span>
            </span>
          </label>
        ) : null}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Sheet>
  );
}
