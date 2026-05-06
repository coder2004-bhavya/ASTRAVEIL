// ═══════════════════════════════════════════════════════
// ROUTES — conjunctions, alerts, trajectory, auth
// ═══════════════════════════════════════════════════════

import { Router } from 'express';
import { query, run, getLastInsertId } from '../db/database.js';
import { computeTrajectory, LAUNCH_SITES } from '../services/trajectoryService.js';
import { broadcast } from '../services/wsService.js';
import crypto from 'crypto';

// ════════════════════════════════════
// CONJUNCTIONS
// ════════════════════════════════════
export const conjunctionsRouter = Router();

// GET /api/conjunctions
conjunctionsRouter.get('/', (req, res) => {
  const { risk, resolved = 0, limit = 20 } = req.query;
  let sql = `SELECT * FROM conjunctions WHERE is_resolved = ?`;
  const params = [parseInt(resolved)];

  if (risk) { sql += ` AND risk_level = ?`; params.push(risk); }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(parseInt(limit));

  const data = query(sql, params);
  res.json({ success: true, count: data.length, data });
});

// GET /api/conjunctions/critical
conjunctionsRouter.get('/critical', (req, res) => {
  const data = query(
    `SELECT * FROM conjunctions WHERE risk_level IN ('critical','high') AND is_resolved=0
     ORDER BY miss_distance_km ASC LIMIT 10`
  );
  res.json({ success: true, data });
});

// POST /api/conjunctions — add new conjunction event
conjunctionsRouter.post('/', (req, res) => {
  const { obj1Name, obj2Name, tca, missDistance, probability, relativeVelocity, riskLevel } = req.body;
  if (!obj1Name || !obj2Name || !tca) {
    return res.status(400).json({ success: false, error: 'obj1Name, obj2Name, tca required' });
  }

  run(
    `INSERT INTO conjunctions (obj1_name, obj2_name, tca, miss_distance_km, probability, relative_velocity_kms, risk_level)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [obj1Name, obj2Name, tca, missDistance, probability, relativeVelocity, riskLevel || 'medium']
  );

  const id = getLastInsertId();
  const newConj = query('SELECT * FROM conjunctions WHERE id = ?', [id])[0];

  // Push to WebSocket clients
  broadcast({ event: 'CONJUNCTION_ALERT', data: newConj });

  res.status(201).json({ success: true, data: newConj });
});

// PATCH /api/conjunctions/:id/resolve
conjunctionsRouter.patch('/:id/resolve', (req, res) => {
  const result = run(`UPDATE conjunctions SET is_resolved=1 WHERE id=?`, [req.params.id]);
  res.json({ success: result.success });
});

// ════════════════════════════════════
// ALERTS
// ════════════════════════════════════
export const alertsRouter = Router();

// GET /api/alerts
alertsRouter.get('/', (req, res) => {
  const { severity, type, unread, limit = 50 } = req.query;
  let sql = `SELECT * FROM alerts WHERE is_archived = 0`;
  const params = [];

  if (severity) { sql += ` AND severity = ?`; params.push(severity); }
  if (type)     { sql += ` AND type = ?`;     params.push(type); }
  if (unread === 'true') { sql += ` AND is_read = 0`; }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(parseInt(limit));

  const data = query(sql, params);
  const unreadCount = query('SELECT COUNT(*) as c FROM alerts WHERE is_read=0 AND is_archived=0')[0]?.c;

  res.json({ success: true, unreadCount, count: data.length, data });
});

// POST /api/alerts — create alert manually
alertsRouter.post('/', (req, res) => {
  const { type, severity, title, message, source } = req.body;
  if (!title || !message) {
    return res.status(400).json({ success: false, error: 'title and message required' });
  }

  run(
    `INSERT INTO alerts (type, severity, title, message, source) VALUES (?, ?, ?, ?, ?)`,
    [type || 'system', severity || 'info', title, message, source || 'MANUAL']
  );

  const id = getLastInsertId();
  const alert = query('SELECT * FROM alerts WHERE id = ?', [id])[0];

  // Broadcast to WebSocket
  broadcast({ event: 'ALERT', data: alert });

  res.status(201).json({ success: true, data: alert });
});

// PATCH /api/alerts/:id/read
alertsRouter.patch('/:id/read', (req, res) => {
  run(`UPDATE alerts SET is_read=1 WHERE id=?`, [req.params.id]);
  res.json({ success: true });
});

// PATCH /api/alerts/read-all
alertsRouter.patch('/read-all', (req, res) => {
  run(`UPDATE alerts SET is_read=1 WHERE is_archived=0`);
  res.json({ success: true });
});

// DELETE /api/alerts/:id
alertsRouter.delete('/:id', (req, res) => {
  run(`UPDATE alerts SET is_archived=1 WHERE id=?`, [req.params.id]);
  res.json({ success: true });
});

// ════════════════════════════════════
// TRAJECTORY
// ════════════════════════════════════
export const trajectoryRouter = Router();

// POST /api/trajectory/compute — compute + store trajectory
trajectoryRouter.post('/compute', (req, res) => {
  const { launchSite, targetType, velocityMs, trajType } = req.body;

  if (!launchSite || !targetType || !velocityMs) {
    return res.status(400).json({ success: false, error: 'launchSite, targetType, velocityMs required' });
  }

  const sessionId = crypto.randomUUID();
  let result;

  try {
    result = computeTrajectory({ launchSite, targetType, velocityMs: parseFloat(velocityMs), trajType });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }

  // Store in DB
  run(
    `INSERT INTO trajectories (session_id, launch_site, launch_lat, launch_lng, target_type, target_alt_km,
      velocity_ms, traj_type, apogee_km, flight_time_s, mach_number, intercept_window, path_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      result.launchSite,
      result.launchLat,
      result.launchLng,
      result.targetType,
      0,
      velocityMs,
      trajType || 'ballistic',
      result.apogeeKm,
      result.flightTimeS,
      result.machNumber,
      JSON.stringify(result.interceptWindow),
      JSON.stringify(result.path),
    ]
  );

  const id = getLastInsertId();

  // Broadcast simulation event
  broadcast({
    event: 'TRAJECTORY_SIMULATED',
    data: {
      id,
      sessionId,
      launchSite: result.launchSite,
      trajType,
      apogeeKm: result.apogeeKm,
      flightTimeS: result.flightTimeS,
    },
  });

  res.json({ success: true, sessionId, data: result });
});

// GET /api/trajectory/history — recent simulations
trajectoryRouter.get('/history', (req, res) => {
  const rows = query(
    `SELECT id, session_id, launch_site, target_type, traj_type, apogee_km,
            flight_time_s, mach_number, intercept_window, created_at
     FROM trajectories ORDER BY created_at DESC LIMIT 20`
  );
  res.json({ success: true, data: rows });
});

// GET /api/trajectory/launch-sites — available sites
trajectoryRouter.get('/launch-sites', (req, res) => {
  res.json({ success: true, data: LAUNCH_SITES });
});

// GET /api/trajectory/:sessionId — full trajectory with path
trajectoryRouter.get('/:sessionId', (req, res) => {
  const row = query(
    `SELECT * FROM trajectories WHERE session_id = ?`,
    [req.params.sessionId]
  )[0];

  if (!row) return res.status(404).json({ success: false, error: 'Trajectory not found' });

  row.path_json = JSON.parse(row.path_json || '[]');
  row.intercept_window = JSON.parse(row.intercept_window || 'null');

  res.json({ success: true, data: row });
});

// ════════════════════════════════════
// AUTH
// ════════════════════════════════════
export const authRouter = Router();

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// POST /api/auth/login
authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'username and password required' });
  }

  const hash = sha256(password);
  const user = query(
    `SELECT id, username, role, clearance_level FROM users WHERE username=? AND password_hash=?`,
    [username, hash]
  )[0];

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  // Update last login
  run(`UPDATE users SET last_login=strftime('%s','now') WHERE id=?`, [user.id]);

  // Simple session token (in prod: use JWT)
  const token = crypto.randomUUID();

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        clearanceLevel: user.clearance_level,
      },
    },
  });
});

// GET /api/auth/me — get current user info
authRouter.get('/me', (req, res) => {
  // Demo: return hardcoded analyst profile
  res.json({
    success: true,
    data: {
      username: 'analyst',
      role: 'analyst',
      clearanceLevel: 2,
      lastLogin: new Date().toISOString(),
    },
  });
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Session terminated' });
});
