import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EmployeeReportRow, ItemSalesRow, ReportSummary } from '../../../../shared/types';
import { api, errorText, qs } from '../../api/client';
import { fmtTime, formatINR, modeLabel } from '../../lib/format';
import { Badge, Card, Empty, ErrorNote, Sheet, Spinner } from '../../components/ui';

export function useSummary(from: string, to: string, refetchMs?: number) {
  return useQuery({
    queryKey: ['reports', 'summary', from, to],
    queryFn: () => api.get<ReportSummary>(`/reports/summary${qs({ from, to })}`),
    refetchInterval: refetchMs,
  });
}

export function StatCards({ s }: { s: ReportSummary }) {
  const tax = s.cgstPaise + s.sgstPaise;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="col-span-2 rounded-2xl bg-brand-900 p-4 text-white sm:col-span-1">
        <p className="text-sm text-brand-200">Sales</p>
        <p className="tabular text-2xl font-black">{formatINR(s.salesPaise)}</p>
      </div>
      <Stat label="Bills" value={String(s.bills)} />
      <Stat label="Average bill" value={s.bills ? formatINR(Math.round(s.salesPaise / s.bills)) : '—'} />
      <Stat label="GST collected" value={formatINR(tax)} sub={`Taxable ${formatINR(s.taxablePaise, { short: true })}`} />
      {s.discountPaise ? <Stat label="Discounts given" value={formatINR(s.discountPaise)} /> : null}
      {s.byPaymentMode.map((m) => (
        <Stat key={m.mode} label={modeLabel[m.mode]} value={formatINR(m.salesPaise)} sub={`${m.bills} bill${m.bills === 1 ? '' : 's'}`} />
      ))}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="tabular text-xl font-bold text-ink">{value}</p>
      {sub ? <p className="tabular text-xs text-neutral-500">{sub}</p> : null}
    </div>
  );
}

/** Per-employee table. Tap a row to see what that employee sold. */
export function EmployeeTable({ s }: { s: ReportSummary }) {
  const [open, setOpen] = useState<EmployeeReportRow | null>(null);
  const oneDay = s.from === s.to;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-4">
        <h2 className="font-bold text-brand-900">Employees</h2>
        <span className="text-xs text-neutral-500">Commission: rule not set yet</span>
      </div>
      {s.employees.length ? (
        <>
          <ul className="mt-2 divide-y divide-neutral-100 sm:hidden">
            {s.employees.map((e) => (
              <li key={e.employeeId}>
                <button type="button" onClick={() => setOpen(e)} className="w-full px-4 py-3 text-left active:bg-brand-50">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-ink">
                      {e.name} {!e.active ? <Badge>Inactive</Badge> : null}
                    </span>
                    <span className="tabular font-bold text-ink">{formatINR(e.salesPaise)}</span>
                  </div>
                  <p className="tabular mt-0.5 text-xs text-neutral-500">
                    {[
                      `${e.bills} bill${e.bills === 1 ? '' : 's'}`,
                      `${e.itemsSold} item${e.itemsSold === 1 ? '' : 's'}`,
                      e.bills ? `avg ${formatINR(e.avgBillPaise, { short: true })}` : '',
                      e.discountPaise ? `discount ${formatINR(e.discountPaise, { short: true })}` : '',
                      e.voids ? `${e.voids} voided` : '',
                      oneDay
                        ? e.firstBillAt && e.lastBillAt
                          ? `${fmtTime(e.firstBillAt)} – ${fmtTime(e.lastBillAt)}`
                          : ''
                        : `${e.daysActive} day${e.daysActive === 1 ? '' : 's'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="tabular mt-2 w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-2 py-2 text-right font-semibold">Sales</th>
                  <th className="px-2 py-2 text-right font-semibold">Bills</th>
                  <th className="px-2 py-2 text-right font-semibold">Items</th>
                  <th className="px-2 py-2 text-right font-semibold">Avg bill</th>
                  <th className="px-2 py-2 text-right font-semibold">Discount</th>
                  <th className="px-2 py-2 text-right font-semibold">Voids</th>
                  <th className="px-4 py-2 text-right font-semibold">{oneDay ? 'First – last bill' : 'Days'}</th>
                </tr>
              </thead>
              <tbody>
                {s.employees.map((e) => (
                  <tr
                    key={e.employeeId}
                    onClick={() => setOpen(e)}
                    className="cursor-pointer border-b border-neutral-50 last:border-0 hover:bg-brand-50"
                  >
                    <td className="px-4 py-3 font-semibold text-ink">
                      {e.name} {!e.active ? <Badge>Inactive</Badge> : null}
                    </td>
                    <td className="px-2 py-3 text-right font-semibold">{formatINR(e.salesPaise)}</td>
                    <td className="px-2 py-3 text-right">{e.bills}</td>
                    <td className="px-2 py-3 text-right">{e.itemsSold}</td>
                    <td className="px-2 py-3 text-right">{e.bills ? formatINR(e.avgBillPaise, { short: true }) : '—'}</td>
                    <td className="px-2 py-3 text-right">{e.discountPaise ? formatINR(e.discountPaise, { short: true }) : '—'}</td>
                    <td className="px-2 py-3 text-right">{e.voids ? <span className="text-red-600">{e.voids}</span> : '—'}</td>
                    <td className="px-4 py-3 text-right text-neutral-600">
                      {oneDay
                        ? e.firstBillAt && e.lastBillAt
                          ? `${fmtTime(e.firstBillAt)} – ${fmtTime(e.lastBillAt)}`
                          : '—'
                        : e.daysActive}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty>No employees yet.</Empty>
      )}
      <EmployeeItemsSheet row={open} from={s.from} to={s.to} onClose={() => setOpen(null)} />
    </Card>
  );
}

function EmployeeItemsSheet({ row, from, to, onClose }: { row: EmployeeReportRow | null; from: string; to: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['reports', 'items', row?.employeeId, from, to],
    queryFn: () => api.get<ItemSalesRow[]>(`/reports/items${qs({ from, to, employeeId: row!.employeeId })}`),
    enabled: !!row,
  });
  if (!row) return null;
  return (
    <Sheet open onClose={onClose} title={`${row.name}: items sold`}>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center text-sm">
        <MiniStat label="Sales" value={formatINR(row.salesPaise, { short: true })} />
        <MiniStat label="Bills" value={String(row.bills)} />
        <MiniStat label="Items" value={String(row.itemsSold)} />
      </div>
      {q.isLoading ? (
        <div className="flex justify-center py-8 text-brand-700">
          <Spinner />
        </div>
      ) : q.error ? (
        <ErrorNote>{errorText(q.error)}</ErrorNote>
      ) : q.data?.length ? (
        <ItemSalesList rows={q.data} />
      ) : (
        <Empty>Nothing sold in this period.</Empty>
      )}
    </Sheet>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-brand-50 px-2 py-2">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="tabular font-bold text-brand-900">{value}</p>
    </div>
  );
}

export function ItemSalesList({ rows }: { rows: ItemSalesRow[] }) {
  return (
    <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 text-sm">
      {rows.map((r, i) => (
        <li key={`${r.itemId ?? 'c'}-${r.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="min-w-0 truncate font-medium text-ink">
            {r.name} {r.custom ? <Badge tone="warn">Unlisted</Badge> : null}
          </span>
          <span className="tabular shrink-0 text-neutral-600">
            {r.qty} pcs · <span className="font-semibold text-ink">{formatINR(r.salesPaise, { short: true })}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
