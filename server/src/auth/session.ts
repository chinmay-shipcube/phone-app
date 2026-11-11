import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../../../shared/types.js';
import { getSettings } from '../db/settings.js';
import { one, pool } from '../db/pool.js';
import { HttpError, forbidden } from '../lib/http.js';

export const COOKIE = 'cd_sid';
const MAX_TRIES = 5;
const LOCK_MINUTES = 5;

export interface SessionUser {
  id: number;
  name: string;
  role: Role;
  hasPin: boolean;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export const hashSecret = (secret: string) => bcrypt.hash(secret, 10);

export const PIN_RE = /^\d{4,6}$/;

export async function createSession(res: Response, userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO sessions (id, user_id) VALUES ($1, $2)', [sha256(token), userId]);
  // Plain HTTP on the shop LAN, so no `secure` flag. httpOnly keeps it away from page scripts.
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 1000 * 60 * 60 * 24 * 30 });
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[COOKIE];
  if (token) await pool.query('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

/**
 * Checks a PIN or password and keeps count of wrong tries. After 5 wrong tries the login is
 * locked for 5 minutes. Throws 401/423 with a message the screen can show.
 */
export async function verifySecret(user: { id: number; locked_until: Date | null }, secret: string, hash: string | null): Promise<void> {
  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    const mins = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
    throw new HttpError(423, `Too many wrong tries. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
  }
  const ok = hash ? await bcrypt.compare(secret, hash) : false;
  if (ok) {
    await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
    return;
  }
  const r = await one<{ failed_attempts: number }>(
    pool,
    `UPDATE users SET failed_attempts = failed_attempts + 1,
       locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) END
     WHERE id = $1 RETURNING failed_attempts`,
    [user.id, MAX_TRIES, LOCK_MINUTES],
  );
  if ((r?.failed_attempts ?? 0) >= MAX_TRIES) {
    await pool.query('UPDATE users SET failed_attempts = 0 WHERE id = $1', [user.id]);
    throw new HttpError(423, `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.`);
  }
  throw new HttpError(401, 'Wrong PIN or password.');
}

/** Loads the logged-in user from the cookie, if any. Ends sessions idle for too long. */
export async function loadUser(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return next();
    const id = sha256(token);
    const row = await one<{ user_id: number; name: string; role: Role; pin_hash: string | null; active: boolean; last_seen: Date }>(
      pool,
      `SELECT s.user_id, u.name, u.role, u.pin_hash, u.active, s.last_seen
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
      [id],
    );
    if (!row || !row.active) {
      if (row) await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
      res.clearCookie(COOKIE, { path: '/' });
      return next();
    }
    const settings = await getSettings();
    const idleMin = row.role === 'admin' ? settings.adminIdleMinutes : settings.employeeIdleMinutes;
    const idleMs = Date.now() - row.last_seen.getTime();
    if (idleMs > idleMin * 60000) {
      await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
      res.clearCookie(COOKIE, { path: '/' });
      return next();
    }
    if (idleMs > 30000) await pool.query('UPDATE sessions SET last_seen = now() WHERE id = $1', [id]);
    req.user = { id: row.user_id, name: row.name, role: row.role, hasPin: !!row.pin_hash, sessionId: id };
    next();
  } catch (e) {
    next(e);
  }
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please log in.'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please log in.'));
  if (req.user.role !== 'admin') return next(forbidden('Admin only.'));
  next();
}
