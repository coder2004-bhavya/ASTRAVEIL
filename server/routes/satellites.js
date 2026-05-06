// ═══════════════════════════════════════════════════════
// ROUTES — /api/satellites
// ═══════════════════════════════════════════════════════

import { Router } from 'express';
import { query, run } from '../db/database.js';
import { getCachedTLE, getAllSatellites, refreshTLECache, classifySat } from '../services/tleService.js';

const router = Router();

// GET /api/satellites — list all active satellites
router.get('/', (req, res) => {
  const { type, limit = 100, offset = 0, country } = req.query;

  let sql = `SELECT * FROM satellites WHERE is_active = 1`;
  const params = [];

  if (type) {
    sql += ` AND type = ?`;
    params.push(type);
  }
  if (country) {
    sql += ` AND country = ?`;
    params.push(country.toUpperCase());
  }

  sql += ` ORDER BY last_updated DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const satellites = query(sql, params);
  const total = query('SELECT COUNT(*) as c FROM satellites WHERE is_active=1')[0]?.c || 0;

  res.json({
    success: true,
    total,
    count: satellites.length,
    data: satellites,
  });
});

// GET /api/satellites/stats — summary counts
router.get('/stats', (req, res) => {
  const stats = {
    total:      query('SELECT COUNT(*) as c FROM satellites')[0]?.c,
    active:     query('SELECT COUNT(*) as c FROM satellites WHERE is_active=1')[0]?.c,
    stations:   query("SELECT COUNT(*) as c FROM satellites WHERE type='station'")[0]?.c,
    navigation: query("SELECT COUNT(*) as c FROM satellites WHERE type='navigation'")[0]?.c,
    debris:     query("SELECT COUNT(*) as c FROM satellites WHERE type='debris'")[0]?.c,
    comms:      query("SELECT COUNT(*) as c FROM satellites WHERE type='comms'")[0]?.c,
    earth_obs:  query("SELECT COUNT(*) as c FROM satellites WHERE type='earth_obs'")[0]?.c,
    india:      query("SELECT COUNT(*) as c FROM satellites WHERE country='INDIA'")[0]?.c,
  };
  res.json({ success: true, data: stats });
});

// GET /api/satellites/tle/:source — raw TLE from cache
router.get('/tle/:source', (req, res) => {
  const { source } = req.params;
  const validSources = ['visual', 'stations', 'irnss', 'gps', 'active'];

  if (!validSources.includes(source)) {
    return res.status(400).json({ success: false, error: 'Invalid TLE source' });
  }

  const cached = getCachedTLE(source);
  if (!cached) {
    return res.status(404).json({ success: false, error: 'No cached data yet — try after startup' });
  }

  res.set('Content-Type', 'text/plain');
  res.set('X-Cache-Age', Math.floor(Date.now() / 1000 - cached.fetchedAt) + 's');
  res.set('X-Stale', cached.isStale ? 'true' : 'false');
  res.send(cached.text);
});

// POST /api/satellites/refresh — trigger TLE refresh
router.post('/refresh', async (req, res) => {
  try {
    const results = await refreshTLECache();
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/satellites/:noradId — single satellite
router.get('/:noradId', (req, res) => {
  const sat = query('SELECT * FROM satellites WHERE norad_id = ?', [req.params.noradId]);
  if (!sat.length) {
    return res.status(404).json({ success: false, error: 'Satellite not found' });
  }
  res.json({ success: true, data: sat[0] });
});

// PUT /api/satellites/:noradId/position — update position (from frontend propagation)
router.put('/:noradId/position', (req, res) => {
  const { lat, lng, altKm } = req.body;
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ success: false, error: 'lat and lng required' });
  }

  const result = run(
    `UPDATE satellites SET lat = ?, lng = ?, alt_km = ?, last_updated = strftime('%s','now')
     WHERE norad_id = ?`,
    [lat, lng, altKm, req.params.noradId]
  );

  res.json({ success: result.success, changes: result.changes });
});

// POST /api/satellites/watchlist — add to watchlist
router.post('/watchlist', (req, res) => {
  const { noradId, satName, notes } = req.body;
  const userId = 1; // hardcoded for demo (replace with session userId)

  const result = run(
    `INSERT INTO watchlist (user_id, norad_id, sat_name, notes) VALUES (?, ?, ?, ?)`,
    [userId, noradId, satName, notes || '']
  );

  res.json({ success: result.success });
});

// GET /api/satellites/watchlist/me — get my watchlist
router.get('/watchlist/me', (req, res) => {
  const userId = 1;
  const list = query(
    `SELECT w.*, s.type, s.lat, s.lng, s.alt_km FROM watchlist w
     LEFT JOIN satellites s ON w.norad_id = s.norad_id
     WHERE w.user_id = ? ORDER BY w.created_at DESC`,
    [userId]
  );
  res.json({ success: true, data: list });
});

export default router;
