import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BillSummary } from '../../../../shared/types';
import { api, errorText, qs } from '../../api/client';
import { fmtDay, today } from '../../lib/format';
import { ErrorNote, Spinner } from '../../components/ui';
import { BillDetailSheet } from '../billing/BillDetailSheet';
import { EmployeeTable, StatCards, useSummary } from './ReportView';
import { BillList } from './BillsPage';

/** The owner's live view: today's numbers and the latest bills, refreshed every few seconds. */
export function TodayPage() {
  const day = today();
  const s = useSummary(day, day, 10_000);
  const recent = useQuery({
    queryKey: ['bills', 'recent', day],
    queryFn: () => api.get<{ bills: BillSummary[] }>(`/bills${qs({ from: day, to: day, limit: 15 })}`),
    refetchInterval: 10_000,
  });
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold text-brand-900">Today</h1>
        <span className="text-sm text-neutral-500">{fmtDay(day)} · updates live</span>
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
      <section>
        <h2 className="mb-2 font-bold text-brand-900">Latest bills</h2>
        <BillList bills={recent.data?.bills ?? []} loading={recent.isLoading} onOpen={setOpen} empty="No bills yet today." />
      </section>
      <BillDetailSheet billId={open} onClose={() => setOpen(null)} canVoid />
    </div>
  );
}
