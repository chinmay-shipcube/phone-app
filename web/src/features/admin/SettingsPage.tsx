import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, RefreshCw } from 'lucide-react';
import type { Settings } from '../../../../shared/types';
import { gstinError } from '../../../../shared/gstin';
import { api, errorText } from '../../api/client';
import { pct } from '../../lib/format';
import { Button, Card, ErrorNote, Field, Input, Select, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';

interface PrinterInfo {
  name: string;
  isDefault: boolean;
  isThermal: boolean;
  isVirtual: boolean;
  offline?: boolean;
}

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings', 'full'], queryFn: () => api.get<Settings>('/settings') });
  const printers = useQuery({ queryKey: ['printers'], queryFn: () => api.get<PrinterInfo[]>('/settings/printers'), staleTime: 60_000 });
  const [form, setForm] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  if (q.data && !form) setForm(q.data);
  if (q.isLoading || !form)
    return (
      <div className="flex justify-center py-10 text-brand-700">{q.error ? <ErrorNote>{errorText(q.error)}</ErrorNote> : <Spinner />}</div>
    );

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });
  const gErr = gstinError(form.gstin);
  const dirty = JSON.stringify(form) !== JSON.stringify(q.data);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = await api.put<Settings>('/settings', form);
      qc.setQueryData(['settings', 'full'], saved);
      qc.invalidateQueries({ queryKey: ['settings', 'public'] });
      setForm(saved);
      toast('Settings saved.', 'good');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const testPrint = async () => {
    setTesting(true);
    try {
      const r = await api.post<{ success: boolean; error?: string; printerUsed?: string }>('/settings/test-print');
      if (r.success) toast(`Test slip sent${r.printerUsed ? ` to ${r.printerUsed}` : ''}.`, 'good');
      else toast(r.error || 'The test print failed.', 'bad');
    } catch (e) {
      toast(errorText(e), 'bad');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand-900">Settings</h1>

      <Card className="space-y-4 p-4">
        <h2 className="font-bold text-brand-900">Shop details on the slip</h2>
        <Field label="Shop name">
          <Input value={form.shopName} onChange={(e) => set('shopName', e.target.value)} />
        </Field>
        <Field label="Address line 1">
          <Input value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} />
        </Field>
        <Field label="Address line 2">
          <Input value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Footer" hint="Printed at the bottom, e.g. exchange policy or thank-you line.">
          <Input value={form.footer} onChange={(e) => set('footer', e.target.value)} />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-bold text-brand-900">GST and bill numbers</h2>
        <Field
          label="Shop GSTIN"
          hint="With a GSTIN the slip says TAX INVOICE. Confirm rates and format with the shop's CA."
          error={gErr || undefined}
        >
          <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} autoCapitalize="characters" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default GST rate" hint="For new and unlisted items.">
            <Select value={form.defaultGstBp} onChange={(e) => set('defaultGstBp', Number(e.target.value))}>
              {[0, 500, 1200, 1800, 2800].map((r) => (
                <option key={r} value={r}>
                  {pct(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default HSN">
            <Input
              value={form.defaultHsn}
              onChange={(e) => set('defaultHsn', e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
            />
          </Field>
        </div>
        <Field
          label="Bill number prefix"
          hint={`Bills look like ${(form.invoicePrefix || 'CD')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 4)}/26-27/00001 and restart every April.`}
        >
          <Input value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase().slice(0, 4))} />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-brand-900">Printer</h2>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700"
            onClick={() => printers.refetch()}
          >
            <RefreshCw size={14} className={printers.isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        <Field label="Thermal printer" hint="Automatic picks the default thermal printer and never a PDF printer.">
          <Select value={form.printerName} onChange={(e) => set('printerName', e.target.value)}>
            <option value="">Automatic</option>
            {(printers.data ?? [])
              .filter((p) => !p.isVirtual)
              .map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.isThermal ? ' (thermal)' : ''}
                  {p.isDefault ? ' (default)' : ''}
                  {p.offline ? ' (offline)' : ''}
                </option>
              ))}
            {form.printerName && !(printers.data ?? []).some((p) => p.name === form.printerName) ? (
              <option value={form.printerName}>{form.printerName}</option>
            ) : null}
          </Select>
        </Field>
        <Field label="Paper width">
          <Select value={form.paper} onChange={(e) => set('paper', e.target.value as Settings['paper'])}>
            <option value="80mm">80 mm (42 characters a line)</option>
            <option value="58mm">58 mm (32 characters a line)</option>
          </Select>
        </Field>
        <Button variant="secondary" onClick={testPrint} disabled={testing || dirty}>
          <Printer size={18} /> {testing ? 'Printing…' : dirty ? 'Save first, then test' : 'Print a test slip'}
        </Button>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-bold text-brand-900">Staff</h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-brand-700"
            checked={form.allowCustomItems}
            onChange={(e) => set('allowCustomItems', e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">Allow unlisted items</span>
            <span className="block text-neutral-500">
              Staff can bill an item that is not in the list yet. It is marked Unlisted, and you can add it from the Items page.
            </span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Staff auto-logout (minutes)" hint="After this long without use.">
            <Input
              value={form.employeeIdleMinutes}
              onChange={(e) => set('employeeIdleMinutes', Number(e.target.value.replace(/\D/g, '')) || 0)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Admin auto-logout (minutes)">
            <Input
              value={form.adminIdleMinutes}
              onChange={(e) => set('adminIdleMinutes', Number(e.target.value.replace(/\D/g, '')) || 0)}
              inputMode="numeric"
            />
          </Field>
        </div>
      </Card>

      <div className="safe-bottom sticky bottom-0 -mx-4 border-t border-neutral-200 bg-white/95 px-4 pt-3 backdrop-blur">
        {error ? (
          <div className="mb-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" disabled={!dirty || busy} onClick={() => setForm(q.data ?? null)}>
            Undo changes
          </Button>
          <Button className="flex-1" disabled={!dirty || busy || !!gErr} onClick={save}>
            {busy ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
