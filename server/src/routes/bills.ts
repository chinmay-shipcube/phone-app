import { Router } from 'express';
import { z } from 'zod';
import { PAYMENT_MODES, type CreateBillResponse } from '../../../shared/types.js';
import { pool } from '../db/pool.js';
import { ah, forbidden, notFound, parse } from '../lib/http.js';
import { requireAdmin, requireUser } from '../auth/session.js';
import { createBill, hasLikelyPrinted, listBills, loadBill, printBill, voidBill } from '../services/bills.js';

export const billsRouter = Router();
billsRouter.use(requireUser);

const createSchema = z.object({
  clientRequestId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        itemId: z.number().int().nullable(),
        name: z.string().max(80),
        qty: z.number().int().min(1, 'Quantity must be at least 1.').max(9999),
        ratePaise: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1, 'Add at least one item.')
    .max(100, 'A bill can have up to 100 lines.'),
  discountPaise: z.number().int().min(0).default(0),
  paymentMode: z.enum(PAYMENT_MODES as [string, ...string[]]),
  customerName: z.string().max(80).optional(),
  customerPhone: z.string().max(20).optional(),
  customerGstin: z.string().max(20).optional(),
});

/** Save and print in one request. The phone shows the printer's answer straight away. */
billsRouter.post(
  '/',
  ah(async (req, res) => {
    const input = parse(createSchema, req.body) as z.infer<typeof createSchema> & { paymentMode: (typeof PAYMENT_MODES)[number] };
    const { id, duplicate } = await createBill(input, req.user!);
    let print = null;
    if (!duplicate || !(await hasLikelyPrinted(id))) print = await printBill(id, 'original', req.user!.id);
    const bill = (await loadBill(pool, id))!;
    const body: CreateBillResponse = { bill, print, duplicate };
    res.status(duplicate ? 200 : 201).json(body);
  }),
);

const listSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  employeeId: z.coerce.number().int().optional(),
  status: z.enum(['completed', 'voided']).optional(),
  q: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/** Admin sees every bill. Employees only ever see their own. */
billsRouter.get(
  '/',
  ah(async (req, res) => {
    const f = parse(listSchema, req.query);
    if (req.user!.role !== 'admin') f.employeeId = req.user!.id;
    res.json(await listBills(f));
  }),
);

async function loadOwn(id: number, user: { id: number; role: string }) {
  const bill = await loadBill(pool, id);
  if (!bill) throw notFound('Bill not found.');
  if (user.role !== 'admin' && bill.employeeId !== user.id) throw forbidden('You can only open your own bills.');
  return bill;
}

billsRouter.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await loadOwn(Number(req.params.id), req.user!));
  }),
);

/**
 * Reprint. If no earlier print reached (or may have reached) paper, it prints the original;
 * otherwise a DUPLICATE COPY. Every print is logged with who asked for it.
 */
billsRouter.post(
  '/:id/reprint',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    await loadOwn(id, req.user!);
    const kind = (await hasLikelyPrinted(id)) ? 'copy' : 'original';
    const print = await printBill(id, kind, req.user!.id);
    res.json({ print, bill: await loadBill(pool, id) });
  }),
);

billsRouter.post(
  '/:id/void',
  requireAdmin,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = parse(z.object({ reason: z.string().trim().min(3, 'Write a short reason.').max(200) }), req.body);
    await voidBill(id, reason, req.user!.id);
    res.json(await loadBill(pool, id));
  }),
);
