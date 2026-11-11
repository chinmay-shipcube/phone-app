import { Router } from 'express';
import { z } from 'zod';
import type { LoginName, Me } from '../../../shared/types.js';
import { many, one, pool } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { HttpError, ah, badRequest, parse } from '../lib/http.js';
import { PIN_RE, createSession, endSession, hashSecret, requireUser, verifySecret } from '../auth/session.js';

export const authRouter = Router();

interface UserRow {
  id: number;
  name: string;
  role: 'employee' | 'admin';
  pin_hash: string | null;
  password_hash: string | null;
  active: boolean;
  locked_until: Date | null;
}

const me = (u: { id: number; name: string; role: 'employee' | 'admin'; hasPin: boolean }): Me => ({
  id: u.id,
  name: u.name,
  role: u.role,
  hasPin: u.hasPin,
});

/** Names shown as buttons on the login screen. Public on the shop network by design. */
authRouter.get(
  '/names',
  ah(async (_req, res) => {
    const rows = await many<{ id: number; name: string; has_pin: boolean }>(
      pool,
      `SELECT id, name, pin_hash IS NOT NULL AS has_pin FROM users
       WHERE role = 'employee' AND active ORDER BY lower(name)`,
    );
    const names: LoginName[] = rows.map((r) => ({ id: r.id, name: r.name, hasPin: r.has_pin }));
    const adminExists = !!(await one(pool, "SELECT 1 FROM users WHERE role = 'admin' AND active"));
    res.json({ names, adminExists });
  }),
);

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const body = parse(z.object({ userId: z.number().int(), pin: z.string().optional() }), req.body);
    const u = await one<UserRow>(pool, 'SELECT * FROM users WHERE id = $1', [body.userId]);
    if (!u || !u.active || u.role !== 'employee') throw new HttpError(401, 'This employee cannot log in.');
    if (u.pin_hash) await verifySecret(u, body.pin ?? '', u.pin_hash);
    await createSession(res, u.id);
    res.json(me({ id: u.id, name: u.name, role: u.role, hasPin: !!u.pin_hash }));
  }),
);

authRouter.post(
  '/admin-login',
  ah(async (req, res) => {
    const body = parse(z.object({ password: z.string().min(1, 'Enter the password.') }), req.body);
    const u = await one<UserRow>(pool, "SELECT * FROM users WHERE role = 'admin' AND active ORDER BY id LIMIT 1");
    if (!u) throw new HttpError(409, 'No admin account yet. Run "npm run create-admin" on the shop laptop.');
    await verifySecret(u, body.password, u.password_hash);
    await createSession(res, u.id);
    res.json(me({ id: u.id, name: u.name, role: u.role, hasPin: false }));
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    await endSession(req, res);
    res.json({ ok: true });
  }),
);

/** The logged-in user, or null. Not a 401, so the login screen loads without an error. */
authRouter.get('/me', (req, res) => {
  res.json(req.user ? me(req.user) : null);
});

/** Employee sets, changes or removes their own PIN. The current PIN is needed when one is set. */
authRouter.post(
  '/pin',
  requireUser,
  ah(async (req, res) => {
    const body = parse(z.object({ currentPin: z.string().optional(), newPin: z.string().nullable() }), req.body);
    const u = await one<UserRow>(pool, 'SELECT * FROM users WHERE id = $1', [req.user!.id]);
    if (!u || u.role !== 'employee') throw badRequest('Only employees have a PIN. Admins change their password instead.');
    if (u.pin_hash) await verifySecret(u, body.currentPin ?? '', u.pin_hash);
    if (body.newPin !== null && !PIN_RE.test(body.newPin)) throw badRequest('PIN must be 4 to 6 digits.');
    const hash = body.newPin === null ? null : await hashSecret(body.newPin);
    await pool.query('UPDATE users SET pin_hash = $1 WHERE id = $2', [hash, u.id]);
    await audit(pool, u.id, hash ? 'set_pin' : 'clear_pin', 'user', u.id);
    res.json({ ok: true, hasPin: !!hash });
  }),
);

/** Admin changes their own password. */
authRouter.post(
  '/password',
  requireUser,
  ah(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string(), newPassword: z.string().min(8, 'Use at least 8 characters.') }), req.body);
    const u = await one<UserRow>(pool, 'SELECT * FROM users WHERE id = $1', [req.user!.id]);
    if (!u || u.role !== 'admin') throw badRequest('Only the admin has a password.');
    await verifySecret(u, body.currentPassword, u.password_hash);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashSecret(body.newPassword), u.id]);
    // Log out every other admin session.
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [u.id, req.user!.sessionId]);
    await audit(pool, u.id, 'change_password', 'user', u.id);
    res.json({ ok: true });
  }),
);
