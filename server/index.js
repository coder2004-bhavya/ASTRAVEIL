// ═══════════════════════════════════════════════════════
// ASTRAVEIL SERVER — Express + WebSocket + SQLite
// Port 3001 | API: /api/* | WebSocket: /ws
// ═══════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initDB } from './db/database.js';
import { initWebSocket } from './services/wsService.js';
import { startTLERefreshJob } from './services/tleService.js';

import satellitesRouter from './routes/satellites.js';
import {
  conjunctionsRouter,
  alertsRouter,
  trajectoryRouter,
  authRouter,
} from './routes/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

async function startServer() {
  // ── Init DB ──
  await initDB();

  const app = express();

  // ── Middleware ──
  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Request logger ──
  app.use((req, _res, next) => {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] ${req.method} ${req.path}`);
    next();
  });

  // ── Health check ──
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ONLINE',
      service: 'ASTRAVEIL API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime().toFixed(0) + 's',
    });
  });

  // ── API info ──
  app.get('/api', (_req, res) => {
    res.json({
      name: 'ASTRAVEIL REST API',
      version: '1.0.0',
      description: 'Space & Defence Situational Awareness Platform',
      endpoints: {
        satellites:    'GET/POST /api/satellites',
        conjunctions:  'GET/POST /api/conjunctions',
        alerts:        'GET/POST /api/alerts',
        trajectory:    'POST    /api/trajectory/compute',
        auth:          'POST    /api/auth/login',
        websocket:     'WS      ws://localhost:3001/ws',
        tle_proxy:     'GET     /api/satellites/tle/:source',
      },
      sources: {
        tleData: 'CelesTrak.org (refreshed every 6h)',
        database: 'SQLite (sql.js)',
      },
    });
  });

  // ── Routes ──
  app.use('/api/satellites',   satellitesRouter);
  app.use('/api/conjunctions', conjunctionsRouter);
  app.use('/api/alerts',       alertsRouter);
  app.use('/api/trajectory',   trajectoryRouter);
  app.use('/api/auth',         authRouter);

  // ── 404 handler ──
  app.use('/api/*', (req, res) => {
    res.status(404).json({ success: false, error: `Route not found: ${req.path}` });
  });

  // ── Error handler ──
  app.use((err, _req, res, _next) => {
    console.error('[SERVER] Error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  // ── Create HTTP server ──
  const server = createServer(app);

  // ── WebSocket ──
  initWebSocket(server);

  // ── Start TLE background job ──
  startTLERefreshJob();

  // ── Listen ──
  server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║         ASTRAVEIL SERVER  v1.0.0             ║');
    console.log('║   Space & Defence Situational Awareness       ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  API:        http://localhost:${PORT}/api         ║`);
    console.log(`║  Health:     http://localhost:${PORT}/health       ║`);
    console.log(`║  WebSocket:  ws://localhost:${PORT}/ws             ║`);
    console.log('║  Database:   SQLite (astraveil.db)            ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
  });
}

startServer().catch(err => {
  console.error('[SERVER] Fatal startup error:', err);
  process.exit(1);
});
