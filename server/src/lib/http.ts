import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const notFound = (m = 'Not found.') => new HttpError(404, m);
export const forbidden = (m = 'You do not have permission for this.') => new HttpError(403, m);

/** Lets async route handlers throw; errors go to errorHandler. */
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    throw badRequest(`${where}${first?.message ?? 'Invalid input.'}`, r.error.issues);
  }
  return r.data;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid input.', details: err.issues });
    return;
  }
  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr?.code === '23505') {
    res.status(409).json({ error: 'That already exists.', details: pgErr.constraint });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the shop laptop. Please try again.' });
}
