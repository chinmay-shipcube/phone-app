import { Router } from 'express';
import { z } from 'zod';
import type { EmployeeReportRow, ItemSalesRow, ReportSummary } from '../../../shared/types.js';
import { shopDateString } from '../../../shared/invoice.js';
import { many, one, pool } from '../db/pool.js';
import { ah, parse } from '../lib/http.js';
import { requireAdmin } from '../auth/session.js';

export const reportsRouter = Router();
reportsRouter.use(requireAdmin);

const DAY = "(b.created_at AT TIME ZONE 'Asia/Kolkata')::date";
const range = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  employeeId: z.coerce.number().int().optional(),
});

function dates(q: unknown) {
  const r = parse(range, q);
  const today = shopDateString(new Date());
  return { from: r.from ?? today, to: r.to ?? r.from ?? today, employeeId: r.employeeId };
}

/**
 * Totals for a date range and one row per employee. Voided bills are left out of sales and
 * counted separately. Commission is not calculated yet: the rule is still to be decided.
 */
reportsRouter.get(
  '/summary',
  ah(async (req, res) => {
    const { from, to } = dates(req.query);
    const p = [from, to];
    const inRange = `${DAY} BETWEEN $1::date AND $2::date`;
    const totals = (await one<Record<string, number>>(
      pool,
      `SELECT count(*)::int AS bills, coalesce(sum(total_paise),0) AS sales, coalesce(sum(taxable_paise),0) AS taxable,
              coalesce(sum(cgst_paise),0) AS cgst, coalesce(sum(sgst_paise),0) AS sgst, coalesce(sum(discount_paise),0) AS discount
       FROM bills b WHERE ${inRange} AND status = 'completed'`,
      p,
    ))!;
    const modes = await many<{ mode: ReportSummary['byPaymentMode'][number]['mode']; bills: number; sales: number }>(
      pool,
      `SELECT payment_mode AS mode, count(*)::int AS bills, sum(total_paise) AS sales
       FROM bills b WHERE ${inRange} AND status = 'completed' GROUP BY payment_mode ORDER BY sales DESC`,
      p,
    );
    const emp = await many<Record<string, unknown>>(
      pool,
      `SELECT u.id, u.name, u.active,
         count(b.id) FILTER (WHERE b.status = 'completed')::int AS bills,
         coalesce(sum(b.total_paise) FILTER (WHERE b.status = 'completed'), 0) AS sales,
         coalesce(sum(b.discount_paise) FILTER (WHERE b.status = 'completed'), 0) AS discount,
         count(b.id) FILTER (WHERE b.status = 'voided')::int AS voids,
         coalesce(sum(b.total_paise) FILTER (WHERE b.status = 'voided'), 0) AS voided,
         count(DISTINCT ${DAY}) FILTER (WHERE b.status = 'completed')::int AS days,
         min(b.created_at) FILTER (WHERE b.status = 'completed') AS first_at,
         max(b.created_at) FILTER (WHERE b.status = 'completed') AS last_at,
         coalesce((SELECT sum(i.qty) FROM bill_items i JOIN bills bb ON bb.id = i.bill_id
                   WHERE bb.employee_id = u.id AND bb.status = 'completed'
                     AND (bb.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1::date AND $2::date), 0) AS items
       FROM users u
       LEFT JOIN bills b ON b.employee_id = u.id AND ${inRange}
       GROUP BY u.id
       HAVING (u.active AND u.role = 'employee') OR count(b.id) > 0
       ORDER BY sales DESC, lower(u.name)`,
      p,
    );
    const employees: EmployeeReportRow[] = emp.map((r) => {
      const bills = r.bills as number;
      const sales = r.sales as number;
      return {
        employeeId: r.id as number,
        name: r.name as string,
        active: r.active as boolean,
        bills,
        salesPaise: sales,
        itemsSold: r.items as number,
        discountPaise: r.discount as number,
        voids: r.voids as number,
        voidedPaise: r.voided as number,
        avgBillPaise: bills ? Math.round(sales / bills) : 0,
        daysActive: r.days as number,
        firstBillAt: r.first_at ? (r.first_at as Date).toISOString() : null,
        lastBillAt: r.last_at ? (r.last_at as Date).toISOString() : null,
      };
    });
    const body: ReportSummary = {
      from,
      to,
      bills: totals.bills,
      salesPaise: totals.sales,
      taxablePaise: totals.taxable,
      cgstPaise: totals.cgst,
      sgstPaise: totals.sgst,
      discountPaise: totals.discount,
      byPaymentMode: modes.map((m) => ({ mode: m.mode, bills: m.bills, salesPaise: m.sales })),
      employees,
    };
    res.json(body);
  }),
);

/** What was sold: per item, optionally for one employee. Unlisted items are marked custom. */
reportsRouter.get(
  '/items',
  ah(async (req, res) => {
    const { from, to, employeeId } = dates(req.query);
    const params: unknown[] = [from, to];
    let emp = '';
    if (employeeId) {
      params.push(employeeId);
      emp = `AND b.employee_id = $${params.length}`;
    }
    const rows = await many<{ name: string; item_id: number | null; custom: boolean; qty: number; sales: number }>(
      pool,
      `SELECT min(i.name) AS name, i.item_id, bool_or(i.custom) AS custom, sum(i.qty) AS qty, sum(i.net_paise) AS sales
       FROM bill_items i JOIN bills b ON b.id = i.bill_id
       WHERE b.status = 'completed' AND ${DAY} BETWEEN $1::date AND $2::date ${emp}
       GROUP BY i.item_id, CASE WHEN i.item_id IS NULL THEN lower(trim(i.name)) END
       ORDER BY sales DESC`,
      params,
    );
    const body: ItemSalesRow[] = rows.map((r) => ({ name: r.name, itemId: r.item_id, custom: r.custom, qty: r.qty, salesPaise: r.sales }));
    res.json(body);
  }),
);
