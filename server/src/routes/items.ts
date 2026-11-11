import { Router } from 'express';
import { z } from 'zod';
import type { Item } from '../../../shared/types.js';
import { many, one, pool, tx } from '../db/pool.js';
import { getSettings } from '../db/settings.js';
import { audit } from '../lib/audit.js';
import { HttpError, ah, notFound, parse } from '../lib/http.js';
import { requireAdmin, requireUser } from '../auth/session.js';

export const itemsRouter = Router();

interface ItemDbRow {
  id: number;
  name: string;
  default_price_paise: number | null;
  hsn: string;
  gst_bp: number;
  active: boolean;
}

export const toItem = (r: ItemDbRow): Item => ({
  id: r.id,
  name: r.name,
  defaultPricePaise: r.default_price_paise,
  hsn: r.hsn,
  gstBp: r.gst_bp,
  active: r.active,
});

const COLS = 'id, name, default_price_paise, hsn, gst_bp, active';

/**
 * The whole catalog in one go. A shop has hundreds of items, not millions, so the phone keeps
 * the list and searches it instantly while the employee types. Staff only see active items.
 */
itemsRouter.get(
  '/',
  requireUser,
  ah(async (req, res) => {
    const all = req.user!.role === 'admin' && req.query.all === '1';
    const rows = await many<ItemDbRow>(pool, `SELECT ${COLS} FROM items ${all ? '' : 'WHERE active'} ORDER BY lower(name)`);
    res.json(rows.map(toItem));
  }),
);

const itemBody = z.object({
  name: z.string().trim().min(1, 'Enter the item name.').max(80, 'Name is too long.'),
  defaultPricePaise: z.number().int().min(0).nullable().optional(),
  hsn: z.string().trim().max(10).optional(),
  gstBp: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().optional(),
});

itemsRouter.post(
  '/',
  requireAdmin,
  ah(async (req, res) => {
    const body = parse(itemBody, req.body);
    const s = await getSettings();
    const clash = await one(pool, 'SELECT 1 FROM items WHERE lower(trim(name)) = lower(trim($1))', [body.name]);
    if (clash) throw new HttpError(409, `"${body.name}" is already in the item list.`);
    const row = await one<ItemDbRow>(
      pool,
      `INSERT INTO items (name, default_price_paise, hsn, gst_bp, active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLS}`,
      [
        body.name,
        body.defaultPricePaise ?? null,
        body.hsn ?? s.defaultHsn,
        body.gstBp ?? s.defaultGstBp,
        body.active ?? true,
        req.user!.id,
      ],
    );
    await audit(pool, req.user!.id, 'create', 'item', row!.id, null, toItem(row!));
    res.status(201).json(toItem(row!));
  }),
);

itemsRouter.patch(
  '/:id',
  requireAdmin,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = parse(itemBody.partial(), req.body);
    const updated = await tx(async (db) => {
      const before = await one<ItemDbRow>(db, `SELECT ${COLS} FROM items WHERE id = $1 FOR UPDATE`, [id]);
      if (!before) throw notFound('Item not found.');
      if (body.name) {
        const clash = await one(db, 'SELECT 1 FROM items WHERE lower(trim(name)) = lower(trim($1)) AND id <> $2', [body.name, id]);
        if (clash) throw new HttpError(409, `"${body.name}" is already in the item list.`);
      }
      const row = await one<ItemDbRow>(
        db,
        `UPDATE items SET name = $1, default_price_paise = $2, hsn = $3, gst_bp = $4, active = $5, updated_at = now()
         WHERE id = $6 RETURNING ${COLS}`,
        [
          body.name ?? before.name,
          body.defaultPricePaise !== undefined ? body.defaultPricePaise : before.default_price_paise,
          body.hsn ?? before.hsn,
          body.gstBp ?? before.gst_bp,
          body.active ?? before.active,
          id,
        ],
      );
      await audit(db, req.user!.id, 'update', 'item', id, toItem(before), toItem(row!));
      return row!;
    });
    res.json(toItem(updated));
  }),
);
