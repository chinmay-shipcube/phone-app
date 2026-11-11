import { Router } from 'express';
import { z } from 'zod';
import { cleanPrefix } from '../../../shared/invoice.js';
import { gstinError, normalizeGstin } from '../../../shared/gstin.js';
import { getSettings, publicSettings, saveSettings } from '../db/settings.js';
import { pool } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { ah, badRequest, parse } from '../lib/http.js';
import { requireAdmin, requireUser } from '../auth/session.js';
import { kit, printerTarget } from '../print/kit.js';

export const settingsRouter = Router();

settingsRouter.get(
  '/public',
  requireUser,
  ah(async (_req, res) => {
    res.json(publicSettings(await getSettings()));
  }),
);

settingsRouter.get(
  '/',
  requireAdmin,
  ah(async (_req, res) => {
    res.json(await getSettings());
  }),
);

const schema = z.object({
  shopName: z.string().trim().min(1, 'Enter the shop name.').max(40),
  addressLine1: z.string().trim().max(60),
  addressLine2: z.string().trim().max(60),
  phone: z.string().trim().max(30),
  gstin: z.string().max(20),
  invoicePrefix: z.string().max(10),
  defaultGstBp: z.number().int().min(0).max(10000),
  defaultHsn: z.string().trim().max(10),
  footer: z.string().trim().max(120),
  printerName: z.string().trim().max(120),
  paper: z.enum(['58mm', '80mm']),
  allowCustomItems: z.boolean(),
  employeeIdleMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  adminIdleMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
});

settingsRouter.put(
  '/',
  requireAdmin,
  ah(async (req, res) => {
    const body = parse(schema, req.body);
    const gstin = normalizeGstin(body.gstin);
    const err = gstinError(gstin);
    if (err) throw badRequest(err);
    const before = await getSettings();
    const saved = await saveSettings({ ...body, gstin, invoicePrefix: cleanPrefix(body.invoicePrefix) });
    await audit(pool, req.user!.id, 'update', 'settings', 1, before, saved);
    res.json(saved);
  }),
);

/** Printers installed on the laptop, for the picker in Settings. */
settingsRouter.get(
  '/printers',
  requireAdmin,
  ah(async (_req, res) => {
    try {
      res.json(await kit.listPrinters({ fresh: true }));
    } catch (e) {
      res.json([]);
      console.error('listPrinters failed:', (e as Error).message);
    }
  }),
);

settingsRouter.post(
  '/test-print',
  requireAdmin,
  ah(async (_req, res) => {
    const s = await getSettings();
    const r = await kit.print(kit.testSlip({ paper: s.paper }), { printer: printerTarget(s.printerName) });
    res.json(r);
  }),
);
