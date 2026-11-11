import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { loadUser } from './auth/session.js';
import { errorHandler } from './lib/http.js';
import { authRouter } from './routes/auth.js';
import { billsRouter } from './routes/bills.js';
import { itemsRouter } from './routes/items.js';
import { reportsRouter } from './routes/reports.js';
import { settingsRouter } from './routes/settings.js';
import { usersRouter } from './routes/users.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // The phones load pages from this server, so nothing may embed it or sniff types.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(loadUser);
  api.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  api.use('/auth', authRouter);
  api.use('/items', itemsRouter);
  api.use('/bills', billsRouter);
  api.use('/users', usersRouter);
  api.use('/reports', reportsRouter);
  api.use('/settings', settingsRouter);
  api.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  api.use(errorHandler);
  app.use('/api', api);

  // The built web app, with every other path falling back to index.html for client routing.
  if (fs.existsSync(config.webDist)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.webDist, 'index.html'));
    });
  }
  return app;
}
