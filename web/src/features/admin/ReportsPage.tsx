import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ItemSalesRow } from '../../../../shared/types';
import { api, errorText, qs } from '../../api/client';
import { daysAgo, fmtDay, monthStart, today } from '../../lib/format';
import { Card, Empty, ErrorNote, Field, Input, Spinner } from '../../components/ui';
import { EmployeeTable, ItemSalesList, StatCards, useSummary } from './ReportView';

const presets = [
  { label: 'Today', range: () => [today(), today()] },
  { label: 'Yesterday', range: () => [daysAgo(1), daysAgo(1)] },
  { label: 'Last 7 days', range: () => [daysAgo(6), today()] },
  { label: 'This month', range: () => [monthStart(), today()] },
] as const;

export function ReportsPage() {
  const [[from, to], setRange] = useState<[string, string]>([daysAgo(6), today()]);
  const s = useSummary(from, to);
  const items = useQuery({
    queryKey: ['reports', 'items', 'all', from, to],
    queryFn: () => api.get<ItemSalesRow[]>(`/reports/items${qs({ from, to })}`),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand-900">Reports</h1>
      <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const [f, t] = p.range();
            const on = f === from && t === to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setRange([f, t])}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${on ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800'}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <Input type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} />
          </Field>
        </div>
        <p className="text-sm text-neutral-500">
          {fmtDay(from)}
          {from !== to ? ` to ${fmtDay(to)}` : ''}. Voided bills are left out of sales.
        </p>
      </div>

      {s.isLoading ? (
        <div className="flex justify-center py-10 text-brand-700">
          <Spinner />
        </div>
      ) : s.error ? (
        <ErrorNote>{errorText(s.error)}</ErrorNote>
      ) : s.data ? (
        <>
          <StatCards s={s.data} />
          <EmployeeTable s={s.data} />
        </>
      ) : null}

      <Card className="p-4">
        <h2 className="mb-3 font-bold text-brand-900">Items sold</h2>
        {items.isLoading ? (
          <div className="flex justify-center py-6 text-brand-700">
            <Spinner />
          </div>
        ) : items.data?.length ? (
          <ItemSalesList rows={items.data} />
        ) : (
          <Empty>Nothing sold in this period.</Empty>
        )}
      </Card>
    </div>
  );
}
