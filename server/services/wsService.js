// ═══════════════════════════════════════════════════════
// WEBSOCKET SERVICE — Live push alerts to all clients
// ═══════════════════════════════════════════════════════

import { WebSocketServer } from 'ws';
import { query, run, getLastInsertId } from '../db/database.js';

let wss = null;
let clients = new Set();

const LIVE_ALERT_TEMPLATES = [
  { type: 'radar',       severity: 'info',     title: 'RADAR SWEEP COMPLETE',    msg: 'Sector Alpha scan complete — {n} objects tracked, 0 anomalies', src: 'RADAR-ALPHA' },
  { type: 'telemetry',   severity: 'info',     title: 'TELEMETRY NOMINAL',       msg: 'IRNSS-1{x} telemetry within bounds — Battery: 98.{y}%', src: 'IRNSS-GCS' },
  { type: 'conjunction', severity: 'warning',  title: 'CONJUNCTION WARNING',      msg: 'Close approach in {h}h — Miss distance: {d}km — Monitoring', src: 'COLLISION-AVOIDANCE' },
  { type: 'debris',      severity: 'info',     title: 'DEBRIS CATALOG UPDATE',   msg: 'TLE catalog refreshed — {n} objects updated from US SPACECOM', src: 'CATALOG-SVC' },
  { type: 'rf',          severity: 'warning',  title: 'RF ANOMALY DETECTED',     msg: 'Signal irregularity on C-band at {lon}°E — Investigating source', src: 'RF-MONITOR' },
  { type: 'system',      severity: 'info',     title: 'GROUND STATION HANDOVER', msg: 'CARTOSAT-3 handover: BENGALURU → BHOPAL — Uplink confirmed', src: 'GS-NETWORK' },
  { type: 'conjunction', severity: 'critical', title: 'CRITICAL CONJUNCTION',    msg: 'Miss distance < 2km detected — ISRO NOC notified — TCA: T+{t}min', src: 'COLLISION-AVOIDANCE' },
  { type: 'telemetry',   severity: 'info',     title: 'ORBIT MANEUVER COMPLETE', msg: 'GSAT-30 station-keeping burn complete — Δv: {dv} m/s', src: 'GSAT-OPS' },
];

function randomAlert() {
  const tmpl = LIVE_ALERT_TEMPLATES[Math.floor(Math.random() * LIVE_ALERT_TEMPLATES.length)];
  const msg = tmpl.msg
    .replace('{n}',  Math.floor(100 + Math.random() * 900))
    .replace('{x}',  String.fromCharCode(65 + Math.floor(Math.random() * 7)))
    .replace('{y}',  Math.floor(Math.random() * 99))
    .replace('{h}',  (1 + Math.random() * 23).toFixed(1))
    .replace('{d}',  (0.5 + Math.random() * 9).toFixed(1))
    .replace('{lon}', (55 + Math.random() * 60).toFixed(1))
    .replace('{t}',  Math.floor(5 + Math.random() * 55))
    .replace('{dv}', (0.1 + Math.random() * 2).toFixed(3));

  return {
    type: tmpl.type,
    severity: tmpl.severity,
    title: tmpl.title,
    message: msg,
    source: tmpl.src,
    timestamp: new Date().toISOString(),
  };
}

export function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected (${ip}) — Total: ${clients.size}`);

    // Send welcome + recent alerts
    const recent = query(
      `SELECT * FROM alerts ORDER BY created_at DESC LIMIT 10`
    );
    ws.send(JSON.stringify({
      event: 'CONNECTED',
      data: {
        message: 'ASTRAVEIL WebSocket established',
        clientCount: clients.size,
        recentAlerts: recent,
      },
    }));

    // Send live satellite count
    const satCount = query('SELECT COUNT(*) as c FROM satellites WHERE is_active = 1')[0]?.c || 0;
    ws.send(JSON.stringify({ event: 'STATS', data: { activeSatellites: satCount } }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(ws, msg);
      } catch {
        ws.send(JSON.stringify({ event: 'ERROR', data: { message: 'Invalid JSON' } }));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected — Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.warn('[WS] Socket error:', err.message);
      clients.delete(ws);
    });
  });

  // Broadcast live alerts every 8-15 seconds
  setInterval(() => {
    if (clients.size === 0) return;

    const alert = randomAlert();

    // Persist to DB
    run(
      `INSERT INTO alerts (type, severity, title, message, source) VALUES (?, ?, ?, ?, ?)`,
      [alert.type, alert.severity, alert.title, alert.message, alert.source]
    );
    const id = getLastInsertId();

    broadcast({
      event: 'ALERT',
      data: { id, ...alert },
    });
  }, 8000 + Math.random() * 7000);

  // Broadcast satellite telemetry every 5 seconds
  setInterval(() => {
    if (clients.size === 0) return;
    broadcast({
      event: 'TELEMETRY',
      data: {
        timestamp: new Date().toISOString(),
        signalStrength: 85 + Math.random() * 15,
        latency: 10 + Math.random() * 40,
        uptime: 99.94,
        activeConnections: clients.size,
        debrisDensityIndex: 4 + Math.random() * 3,
      },
    });
  }, 5000);

  console.log('[WS] WebSocket server initialized at /ws');
  return wss;
}

function handleClientMessage(ws, msg) {
  switch (msg.event) {
    case 'SUBSCRIBE_SATELLITE': {
      const sat = query('SELECT * FROM satellites WHERE norad_id = ?', [msg.noradId])[0];
      ws.send(JSON.stringify({ event: 'SATELLITE_DATA', data: sat || null }));
      break;
    }
    case 'PING': {
      ws.send(JSON.stringify({ event: 'PONG', data: { ts: Date.now() } }));
      break;
    }
    case 'GET_STATS': {
      const stats = {
        satellites: query('SELECT COUNT(*) as c FROM satellites WHERE is_active=1')[0]?.c,
        conjunctions: query('SELECT COUNT(*) as c FROM conjunctions WHERE is_resolved=0')[0]?.c,
        alerts: query('SELECT COUNT(*) as c FROM alerts WHERE is_read=0')[0]?.c,
        clients: clients.size,
      };
      ws.send(JSON.stringify({ event: 'STATS', data: stats }));
      break;
    }
    default:
      ws.send(JSON.stringify({ event: 'ERROR', data: { message: `Unknown event: ${msg.event}` } }));
  }
}

export function broadcast(payload) {
  const msg = JSON.stringify(payload);
  clients.forEach(ws => {
    if (ws.readyState === 1) { // OPEN
      try { ws.send(msg); } catch {}
    }
  });
}

export function getClientCount() {
  return clients.size;
}
