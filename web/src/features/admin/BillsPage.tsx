import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { BillSummary, UserRow } from '../../../../shared/types';
import { api, errorText, qs } from '../../api/client';
import { daysAgo, fmtDateTime, formatINR, modeLabel, today } from '../../lib/format';
import { Badge, Button, Empty, ErrorNote, Field, Input, Select, Spinner } from '../../components/ui';
import { BillDetailSheet } from '../billing/BillDetailSheet';

const PAGE = 50;

export function BillsPage() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/users') });
  const bills = useInfiniteQuery({
    queryKey: ['bills', 'admin', from, to, employeeId, status, q],
    queryFn: ({ pageParam }) =>
      api.get<{ bills: BillSummary[]; total: number }>(
        `/bills${qs({ from, to, employeeId, status, q: q.trim(), limit: PAGE, offset: pageParam })}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((a, p) => a + p.bills.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const list = bills.data?.pages.flatMap((p) => p.bills) ?? [];
  const total = bills.data?.pages[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand-900">Bills</h1>
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:grid-cols-5">
        <Field label="From">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Employee">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Everyone</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
          </Select>
        </Field>
        <Field label="Search">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill no, customer, item" className="pl-9" />
          </div>
        </Field>
      </div>
      {bills.error ? <ErrorNote>{errorText(bills.error)}</ErrorNote> : null}
      <p className="text-sm text-neutral-500">
        {total} bill{total === 1 ? '' : 's'}
      </p>
      <BillList bills={list} loading={bills.isLoading} onOpen={setOpen} empty="No bills match." />
      {bills.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => bills.fetchNextPage()} disabled={bills.isFetchingNextPage}>
            {bills.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
      <BillDetailSheet billId={open} onClose={() => setOpen(null)} canVoid />
    </div>
  );
}

export function BillList({
  bills,
  loading,
  onOpen,
  empty,
}: {
  bills: BillSummary[];
  loading: boolean;
  onOpen: (id: number) => void;
  empty: string;
}) {
  if (loading)
    return (
      <div className="flex justify-center py-10 text-brand-700">
        <Spinner />
      </div>
    );
  if (!bills.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {bills.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => onOpen(b.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">
                {b.invoiceNo} <span className="font-normal text-neutral-500">· {b.employeeName}</span>
              </p>
              <p className="truncate text-xs text-neutral-500">
                {fmtDateTime(b.createdAt)} · {b.itemCount} line{b.itemCount === 1 ? '' : 's'} · {modeLabel[b.paymentMode]}
                {b.customerName ? ` · ${b.customerName}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
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
  );
}
