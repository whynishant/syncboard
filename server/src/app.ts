import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { roomsRouter } from './routes/rooms.js';

export function createApp() {
  const app = express();
  const origins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',').map(v => v.trim());
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: (origin, cb) => { if (!origin || origins.includes(origin)) cb(null, true); else cb(new Error('Origin not allowed')); }, credentials: true }));
  app.use(express.json({ limit: '300kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'syncboard-api', time: new Date().toISOString() }));
  app.use('/api/rooms', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }), roomsRouter);
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof Error && err.message === 'Origin not allowed') return res.status(403).json({ error: 'Origin not allowed' });
    console.error('Unhandled request error', err instanceof Error ? err.message : 'unknown error');
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
