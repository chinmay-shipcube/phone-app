import type pg from 'pg';
import type { BillDetail, BillSummary, CreateBillInput, PrintResult, PrintStatus } from '../../../shared/types.js';
import { BillMathError, computeBill } from '../../../shared/gst.js';
import { financialYear, formatInvoiceNo, cleanPrefix } from '../../../shared/invoice.js';
import { gstinError, normalizeGstin } from '../../../shared/gstin.js';
import { many, one, pool, tx, type Db } from '../db/pool.js';
import { getSettings } from '../db/settings.js';
import { audit } from '../lib/audit.js';
import { HttpError, badRequest, notFound } from '../lib/http.js';
import { kit, printerTarget } from '../print/kit.js';
import { buildSlip } from '../print/slip.js';

const SUMMARY_SELECT = `
  SELECT b.id, b.invoice_no, b.employee_id, u.name AS employee_name, b.created_at, b.status, b.payment_mode,
         b.total_paise, b.customer_name,
         (SELECT count(*)::int FROM bill_items i WHERE i.bill_id = b.id) AS item_count,
         (SELECT p.status FROM print_jobs p WHERE p.bill_id = b.id ORDER BY p.id DESC LIMIT 1) AS last_print_status
  FROM bills b JOIN users u ON u.id = b.employee_id`;

interface SummaryRow {
  id: number;
  invoice_no: string;
  employee_id: number;
  employee_name: string;
  created_at: Date;
  status: 'completed' | 'voided';
  payment_mode: BillSummary['paymentMode'];
  total_paise: number;
  customer_name: string;
  item_count: number;
  last_print_status: PrintStatus | null;
}

const toSummary = (r: SummaryRow): BillSummary => ({
  id: r.id,
  invoiceNo: r.invoice_no,
  employeeId: r.employee_id,
  employeeName: r.employee_name,
  createdAt: r.created_at.toISOString(),
  status: r.status,
  paymentMode: r.payment_mode,
  totalPaise: r.total_paise,
  itemCount: r.item_count,
  customerName: r.customer_name,
  lastPrintStatus: r.last_print_status,
});

export async function loadBill(db: Db, id: number): Promise<BillDetail | null> {
  const s = await one<SummaryRow & Record<string, unknown>>(
    db,
    `SELECT x.*, b.customer_phone, b.customer_gstin, b.gross_paise, b.discount_paise, b.taxable_paise, b.cgst_paise,
            b.sgst_paise, b.void_reason, b.voided_at, v.name AS voided_by_name
     FROM (${SUMMARY_SELECT} WHERE b.id = $1) x
     JOIN bills b ON b.id = x.id LEFT JOIN users v ON v.id = b.voided_by`,
    [id],
  );
  if (!s) return null;
  const lines = await many<Record<string, unknown>>(db, 'SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY line_no', [id]);
  const prints = await many<Record<string, unknown>>(
    db,
    `SELECT p.id, p.kind, p.status, p.error, p.created_at, coalesce(u.name, '') AS requested_by_name
     FROM print_jobs p LEFT JOIN users u ON u.id = p.requested_by WHERE p.bill_id = $1 ORDER BY p.id`,
    [id],
  );
  return {
    ...toSummary(s),
    customerPhone: s.customer_phone as string,
    customerGstin: s.customer_gstin as string,
    grossPaise: s.gross_paise as number,
    discountPaise: s.discount_paise as number,
    taxablePaise: s.taxable_paise as number,
    cgstPaise: s.cgst_paise as number,
    sgstPaise: s.sgst_paise as number,
    voidReason: s.void_reason as string,
    voidedAt: s.voided_at ? (s.voided_at as Date).toISOString() : null,
    voidedByName: (s.voided_by_name as string) || '',
    lines: lines.map((l) => ({
      lineNo: l.line_no as number,
      itemId: (l.item_id as number) ?? null,
      name: l.name as string,
      custom: l.custom as boolean,
      hsn: l.hsn as string,
      gstBp: l.gst_bp as number,
      qty: l.qty as number,
      ratePaise: l.rate_paise as number,
      grossPaise: l.gross_paise as number,
      discountPaise: l.discount_paise as number,
      netPaise: l.net_paise as number,
      taxablePaise: l.taxable_paise as number,
      taxPaise: l.tax_paise as number,
    })),
    prints: prints.map((p) => ({
      id: p.id as number,
      kind: p.kind as 'original' | 'copy',
      status: p.status as PrintStatus,
      error: p.error as string,
      requestedByName: p.requested_by_name as string,
      createdAt: (p.created_at as Date).toISOString(),
    })),
  };
}

export interface BillFilter {
  from?: string; // YYYY-MM-DD, shop time, inclusive
  to?: string;
  employeeId?: number;
  status?: 'completed' | 'voided';
  q?: string;
  limit?: number;
  offset?: number;
}

export async function listBills(f: BillFilter): Promise<{ bills: BillSummary[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.from) add("(b.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ?::date", f.from);
  if (f.to) add("(b.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ?::date", f.to);
  if (f.employeeId) add('b.employee_id = ?', f.employeeId);
  if (f.status) add('b.status = ?', f.status);
  if (f.q) {
    params.push(`%${f.q.trim()}%`);
    const n = params.length;
    where.push(
      `(b.invoice_no ILIKE $${n} OR b.customer_name ILIKE $${n} OR b.customer_phone ILIKE $${n}
        OR EXISTS (SELECT 1 FROM bill_items i WHERE i.bill_id = b.id AND i.name ILIKE $${n}))`,
    );
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await one<{ n: number }>(pool, `SELECT count(*)::int AS n FROM bills b ${w}`, params))!.n;
  params.push(Math.min(f.limit ?? 50, 200), f.offset ?? 0);
  const rows = await many<SummaryRow>(
    pool,
    `${SUMMARY_SELECT} ${w} ORDER BY b.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { bills: rows.map(toSummary), total };
}

/**
 * Saves a bill in one transaction: checks the lines against the item list, works out GST,
 * takes the next invoice number for the financial year, and writes the bill, its lines and the
 * audit record. A repeated clientRequestId returns the bill saved the first time.
 */
export async function createBill(input: CreateBillInput, user: { id: number }): Promise<{ id: number; duplicate: boolean }> {
  const existing = await one<{ id: number }>(pool, 'SELECT id FROM bills WHERE client_request_id = $1', [input.clientRequestId]);
  if (existing) return { id: existing.id, duplicate: true };

  const s = await getSettings();
  const gstin = normalizeGstin(input.customerGstin ?? '');
  const gErr = gstinError(gstin);
  if (gErr) throw badRequest(gErr);

  const itemIds = [...new Set(input.lines.map((l) => l.itemId).filter((x): x is number => x !== null))];
  const items = itemIds.length
    ? await many<{ id: number; name: string; hsn: string; gst_bp: number; active: boolean }>(
        pool,
        'SELECT id, name, hsn, gst_bp, active FROM items WHERE id = ANY($1)',
        [itemIds],
      )
    : [];
  const byId = new Map(items.map((i) => [i.id, i]));

  const lines = input.lines.map((l) => {
    if (l.itemId !== null) {
      const it = byId.get(l.itemId);
      if (!it || !it.active) throw badRequest(`"${l.name}" is no longer in the item list. Remove it and add it again.`);
      return { itemId: it.id, name: it.name, custom: false, hsn: it.hsn, gstBp: it.gst_bp, qty: l.qty, ratePaise: l.ratePaise };
    }
    if (!s.allowCustomItems) throw badRequest(`"${l.name}" is not in the item list. Ask the admin to add it.`);
    const name = l.name.trim();
    if (!name) throw badRequest('An item has no name.');
    return { itemId: null, name, custom: true, hsn: s.defaultHsn, gstBp: s.defaultGstBp, qty: l.qty, ratePaise: l.ratePaise };
  });

  let totals;
  try {
    totals = computeBill(lines, input.discountPaise);
  } catch (e) {
    if (e instanceof BillMathError) throw badRequest(e.message);
    throw e;
  }

  try {
    const id = await tx(async (db: pg.PoolClient) => {
      const fy = financialYear(new Date());
      const seq = (await one<{ last_no: number }>(
        db,
        `INSERT INTO invoice_counters (fy, last_no) VALUES ($1, 1)
         ON CONFLICT (fy) DO UPDATE SET last_no = invoice_counters.last_no + 1 RETURNING last_no`,
        [fy],
      ))!.last_no;
      const invoiceNo = formatInvoiceNo(cleanPrefix(s.invoicePrefix), fy, seq);
      const bill = await one<{ id: number }>(
        db,
        `INSERT INTO bills (invoice_no, fy, seq, client_request_id, employee_id, customer_name, customer_phone,
           customer_gstin, payment_mode, gross_paise, discount_paise, taxable_paise, cgst_paise, sgst_paise, total_paise)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [
          invoiceNo,
          fy,
          seq,
          input.clientRequestId,
          user.id,
          (input.customerName ?? '').trim(),
          (input.customerPhone ?? '').trim(),
          gstin,
          input.paymentMode,
          totals.grossPaise,
          totals.discountPaise,
          totals.taxablePaise,
          totals.cgstPaise,
          totals.sgstPaise,
          totals.totalPaise,
        ],
      );
      for (const [i, l] of totals.lines.entries()) {
        const src = lines[i];
        await db.query(
          `INSERT INTO bill_items (bill_id, line_no, item_id, name, custom, hsn, gst_bp, qty, rate_paise, gross_paise,
             discount_paise, net_paise, taxable_paise, tax_paise)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            bill!.id,
            i + 1,
            src.itemId,
            src.name,
            src.custom,
            src.hsn,
            l.gstBp,
            l.qty,
            l.ratePaise,
            l.grossPaise,
            l.discountPaise,
            l.netPaise,
            l.taxablePaise,
            l.taxPaise,
          ],
        );
      }
      await audit(db, user.id, 'create', 'bill', bill!.id, null, { invoiceNo, totalPaise: totals.totalPaise });
      return bill!.id;
    });
    return { id, duplicate: false };
  } catch (e) {
    // Two taps raced each other: the second insert hit the unique request id. Return the first.
    const pgErr = e as { code?: string; constraint?: string };
    if (pgErr.code === '23505' && pgErr.constraint === 'bills_client_request_id_key') {
      const again = await one<{ id: number }>(pool, 'SELECT id FROM bills WHERE client_request_id = $1', [input.clientRequestId]);
      if (again) return { id: again.id, duplicate: true };
    }
    throw e;
  }
}

/**
 * Prints a bill through the printing kit and records the outcome. Never retries by itself:
 * a timed-out job is marked "unknown" because the slip may already be on paper.
 */
export async function printBill(billId: number, kind: 'original' | 'copy', requestedBy: number): Promise<PrintResult> {
  const bill = await loadBill(pool, billId);
  if (!bill) throw notFound('Bill not found.');
  if (bill.status === 'voided') throw new HttpError(409, 'This bill was voided and cannot be printed.');
  const s = await getSettings();
  const target = printerTarget(s.printerName);
  const job = (await one<{ id: number }>(
    pool,
    "INSERT INTO print_jobs (bill_id, kind, status, printer, requested_by) VALUES ($1, $2, 'pending', $3, $4) RETURNING id",
    [billId, kind, target, requestedBy],
  ))!;

  let status: PrintStatus;
  let error = '';
  try {
    const r = await kit.print(buildSlip(bill, s, kind), { printer: target, jobId: `cd-job-${job.id}` });
    if (r.success) status = 'printed';
    else {
      status = r.timedOut || r.noRetry ? 'unknown' : 'failed';
      error = r.error || 'Print failed.';
    }
  } catch (e) {
    status = 'failed';
    error = (e as Error).message;
  }
  await pool.query('UPDATE print_jobs SET status = $1, error = $2, finished_at = now() WHERE id = $3', [status, error, job.id]);
  return { jobId: job.id, status, ...(error ? { error } : {}) };
}

/** Whether an earlier print of this bill printed or may have printed. */
export async function hasLikelyPrinted(billId: number): Promise<boolean> {
  const r = await one(pool, "SELECT 1 FROM print_jobs WHERE bill_id = $1 AND status IN ('printed', 'unknown', 'pending')", [billId]);
  return !!r;
}

export async function voidBill(billId: number, reason: string, adminId: number): Promise<void> {
  await tx(async (db) => {
    const b = await one<{ status: string; invoice_no: string; total_paise: number }>(
      db,
      'SELECT status, invoice_no, total_paise FROM bills WHERE id = $1 FOR UPDATE',
      [billId],
    );
    if (!b) throw notFound('Bill not found.');
    if (b.status === 'voided') throw new HttpError(409, 'This bill is already voided.');
    await db.query("UPDATE bills SET status = 'voided', void_reason = $1, voided_by = $2, voided_at = now() WHERE id = $3", [
      reason,
      adminId,
      billId,
    ]);
    await audit(db, adminId, 'void', 'bill', billId, { status: b.status }, { status: 'voided', reason, invoiceNo: b.invoice_no });
  });
}
