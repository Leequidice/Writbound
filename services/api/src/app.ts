import express, { type ErrorRequestHandler } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { workerRoutes, type WorkerConfig } from './worker.js';
import { nearRoutes, type NearConfig } from './near.js';
export function createApp(db: DatabaseSync, worker?: WorkerConfig, near?: NearConfig) {
  const app = express();
  app.disable('x-powered-by');
  if (worker) app.use('/jobs', workerRoutes(db, worker));
  if (near) app.use('/near', nearRoutes(db, near));
  app.use(express.json({ limit: '16kb', strict: true }));
  app.get('/health', (req, res) => {
    if (Object.keys(req.query).length) { res.status(400).json({ error: 'Health endpoint accepts no query parameters' }); return; }
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', service: 'writbound-api', database: 'ready', network: 'testnet' });
  });
  app.use((_req, res) => { res.status(404).json({ error: 'Route not found' }); });
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 500;
    const safeStatus = status === 400 || status === 413 ? status : 500;
    res.status(safeStatus).json({ error: safeStatus === 400 ? 'Invalid JSON request' : safeStatus === 413 ? 'Request exceeds size limit' : 'Internal server error' });
  };
  app.use(errors);
  return app;
}
