import { Router } from 'express';
import { z } from 'zod';
import type { UserRow } from '../../../shared/types.js';
import { many, one, pool, tx } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { HttpError, ah, badRequest, notFound, parse } from '../lib/http.js';
import { PIN_RE, hashSecret, requireAdmin } from '../auth/session.js';

export const usersRouter = Router();
usersRouter.use(requireAdmin);

const toRow = (r: {
  id: number;
  name: string;
  role: 'employee' | 'admin';
  active: boolean;
  has_pin: boolean;
  created_at: Date;
}): UserRow => ({
  id: r.id,
  name: r.name,
  role: r.role,
  active: r.active,
  hasPin: r.has_pin,
  createdAt: r.created_at.toISOString(),
});

const SELECT = 'SELECT id, name, role, active, pin_hash IS NOT NULL AS has_pin, created_at FROM users';
const name = z.string().trim().min(1, 'Enter a name.').max(40, 'Name is too long.');
const pin = z.string().nullable().optional();

usersRouter.get(
  '/',
  ah(async (_req, res) => {
    const rows = await many<Parameters<typeof toRow>[0]>(pool, `${SELECT} ORDER BY role DESC, active DESC, lower(name)`);
    res.json(rows.map(toRow));
  }),
);

/** New employee. PIN is optional; the employee can set one later. */
usersRouter.post(
  '/',
  ah(async (req, res) => {
    const body = parse(z.object({ name, pin }), req.body);
    if (body.pin && !PIN_RE.test(body.pin)) throw badRequest('PIN must be 4 to 6 digits.');
    const exists = await one(pool, 'SELECT 1 FROM users WHERE lower(trim(name)) = lower(trim($1))', [body.name]);
    if (exists) throw new HttpError(409, `"${body.name}" already exists. Use a different name.`);
    const hash = body.pin ? await hashSecret(body.pin) : null;
    const row = await one<{ id: number }>(pool, "INSERT INTO users (name, role, pin_hash) VALUES ($1, 'employee', $2) RETURNING id", [
      body.name,
      hash,
    ]);
    await audit(pool, req.user!.id, 'create', 'user', row!.id, null, { name: body.name, hasPin: !!hash });
    const created = await one<Parameters<typeof toRow>[0]>(pool, `${SELECT} WHERE id = $1`, [row!.id]);
    res.status(201).json(toRow(created!));
  }),
);

/** Rename, activate or deactivate, and set or clear an employee's PIN (pin: null clears it). */
usersRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = parse(z.object({ name: name.optional(), active: z.boolean().optional(), pin }), req.body);
    const updated = await tx(async (db) => {
      const before = await one<{ id: number; name: string; role: string; active: boolean; pin_hash: string | null }>(
        db,
        'SELECT id, name, role, active, pin_hash FROM users WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!before) throw notFound('Employee not found.');
      if (before.role === 'admin' && body.active === false) throw badRequest('The admin account cannot be deactivated.');
      if (before.role === 'admin' && body.pin !== undefined) throw badRequest('The admin uses a password, not a PIN.');
      if (body.name && body.name.toLowerCase() !== before.name.toLowerCase()) {
        const clash = await one(db, 'SELECT 1 FROM users WHERE lower(trim(name)) = lower(trim($1)) AND id <> $2', [body.name, id]);
        if (clash) throw new HttpError(409, `"${body.name}" already exists.`);
      }
      let pinHash = before.pin_hash;
      if (body.pin !== undefined) {
        if (body.pin !== null && !PIN_RE.test(body.pin)) throw badRequest('PIN must be 4 to 6 digits.');
        pinHash = body.pin === null ? null : await hashSecret(body.pin);
      }
      await db.query('UPDATE users SET name = $1, active = $2, pin_hash = $3, failed_attempts = 0, locked_until = NULL WHERE id = $4', [
        body.name ?? before.name,
        body.active ?? before.active,
        pinHash,
        id,
      ]);
      // A deactivated employee or a changed PIN logs that employee out everywhere.
      if (body.active === false || body.pin !== undefined) await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);
      await audit(
        db,
        req.user!.id,
        'update',
        'user',
        id,
        { name: before.name, active: before.active, hasPin: !!before.pin_hash },
        { name: body.name ?? before.name, active: body.active ?? before.active, hasPin: !!pinHash },
      );
      return one<Parameters<typeof toRow>[0]>(db, `${SELECT} WHERE id = $1`, [id]);
    });
    res.json(toRow(updated!));
  }),
);
