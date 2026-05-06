// ═══════════════════════════════════════════════════════
// DATABASE — sql.js SQLite (pure JS, no native build)
// Tables: satellites, conjunctions, alerts, trajectories, sessions
// ═══════════════════════════════════════════════════════

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../astraveil.db');

let db = null;

export async function initDB() {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from disk');
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new in-memory database');
  }

  createSchema();
  seedInitialData();
  return db;
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS satellites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      norad_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      line1 TEXT,
      line2 TEXT,
      type TEXT DEFAULT 'unknown',
      country TEXT DEFAULT 'UNKNOWN',
      launch_date TEXT,
      lat REAL,
      lng REAL,
      alt_km REAL,
      last_updated INTEGER DEFAULT (strftime('%s','now')),
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS conjunctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      obj1_name TEXT NOT NULL,
      obj2_name TEXT NOT NULL,
      obj1_norad TEXT,
      obj2_norad TEXT,
      tca TEXT NOT NULL,
      miss_distance_km REAL NOT NULL,
      probability TEXT NOT NULL,
      relative_velocity_kms REAL,
      risk_level TEXT DEFAULT 'low',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      is_resolved INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT DEFAULT 'SYSTEM',
      latitude REAL,
      longitude REAL,
      altitude_km REAL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      is_read INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trajectories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      launch_site TEXT NOT NULL,
      launch_lat REAL,
      launch_lng REAL,
      target_type TEXT NOT NULL,
      target_alt_km REAL,
      velocity_ms REAL,
      traj_type TEXT DEFAULT 'ballistic',
      apogee_km REAL,
      flight_time_s REAL,
      mach_number REAL,
      intercept_window TEXT,
      path_json TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'analyst',
      clearance_level INTEGER DEFAULT 1,
      last_login INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      norad_id TEXT NOT NULL,
      sat_name TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tle_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      fetched_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  console.log('[DB] Schema created/verified');
}

function seedInitialData() {
  // Seed demo satellites
  const satCount = db.exec('SELECT COUNT(*) as c FROM satellites')[0]?.values[0][0];
  if (satCount === 0) {
    const DEMO_SATS = [
      { norad: '25544', name: 'ISS (ZARYA)',       type: 'station',    country: 'ISS',   alt: 408,   lat: 12.4, lng: 77.5 },
      { norad: '39199', name: 'IRNSS-1A',          type: 'navigation', country: 'INDIA', alt: 35786, lat: 29.0, lng: 55.0 },
      { norad: '40547', name: 'IRNSS-1B',          type: 'navigation', country: 'INDIA', alt: 35786, lat: 29.0, lng: 63.0 },
      { norad: '40269', name: 'IRNSS-1C',          type: 'navigation', country: 'INDIA', alt: 35786, lat: 0.0,  lng: 83.0 },
      { norad: '41241', name: 'IRNSS-1D',          type: 'navigation', country: 'INDIA', alt: 35786, lat: 29.0, lng: 111.75 },
      { norad: '41384', name: 'IRNSS-1E',          type: 'navigation', country: 'INDIA', alt: 35786, lat: 29.0, lng: 111.75 },
      { norad: '41469', name: 'IRNSS-1F',          type: 'navigation', country: 'INDIA', alt: 35786, lat: 0.0,  lng: 32.5 },
      { norad: '41589', name: 'IRNSS-1G',          type: 'navigation', country: 'INDIA', alt: 35786, lat: 0.0,  lng: 129.5 },
      { norad: '44793', name: 'CARTOSAT-3',        type: 'earth_obs',  country: 'INDIA', alt: 509,   lat: 22.0, lng: 88.0 },
      { norad: '44233', name: 'RISAT-2B',          type: 'sar',        country: 'INDIA', alt: 555,   lat: 15.0, lng: 72.0 },
      { norad: '45026', name: 'GSAT-30',           type: 'comms',      country: 'INDIA', alt: 35786, lat: 0.1,  lng: 83.0 },
      { norad: '37387', name: 'RESOURCESAT-2',     type: 'earth_obs',  country: 'INDIA', alt: 817,   lat: 18.0, lng: 60.0 },
      { norad: '40730', name: 'NAVSTAR GPS SVN-77',type: 'navigation', country: 'USA',   alt: 20200, lat: 55.0, lng: 160.0 },
      { norad: '29228', name: 'COSMOS 2251 DEB',   type: 'debris',     country: 'CIS',   alt: 780,   lat: 72.0, lng: 42.0 },
      { norad: '34428', name: 'IRIDIUM 33 DEB',    type: 'debris',     country: 'USA',   alt: 776,   lat: 86.0, lng: 100.0 },
    ];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO satellites (norad_id, name, type, country, alt_km, lat, lng)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    DEMO_SATS.forEach(s => stmt.run([s.norad, s.name, s.type, s.country, s.alt, s.lat, s.lng]));
    stmt.free();
    console.log(`[DB] Seeded ${DEMO_SATS.length} demo satellites`);
  }

  // Seed demo conjunctions
  const conjCount = db.exec('SELECT COUNT(*) as c FROM conjunctions')[0]?.values[0][0];
  if (conjCount === 0) {
    const CONJUNCTIONS = [
      { o1: 'COSMOS 2251 DEB', o2: 'IRIDIUM 33 DEB', tca: 'T+02:14:33 UTC', miss: 1.2, prob: '1:312', vel: 8.4, risk: 'critical' },
      { o1: 'SL-8 R/B',        o2: 'STARLINK-1847',   tca: 'T+05:42:17 UTC', miss: 3.7, prob: '1:1240', vel: 7.1, risk: 'high' },
      { o1: 'FENGYUN 1C DEB',  o2: 'RESOURCESAT-2',   tca: 'T+09:11:05 UTC', miss: 4.8, prob: '1:3100', vel: 9.2, risk: 'high' },
      { o1: 'COSMOS 954 DEB',  o2: 'CARTOSAT-3',      tca: 'T+14:22:41 UTC', miss: 7.2, prob: '1:8400', vel: 6.8, risk: 'medium' },
      { o1: 'DELTA 1 DEB',     o2: 'RISAT-2B',        tca: 'T+18:55:12 UTC', miss: 9.1, prob: '1:22000',vel: 5.3, risk: 'low' },
    ];

    const stmt = db.prepare(`
      INSERT INTO conjunctions (obj1_name, obj2_name, tca, miss_distance_km, probability, relative_velocity_kms, risk_level)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    CONJUNCTIONS.forEach(c => stmt.run([c.o1, c.o2, c.tca, c.miss, c.prob, c.vel, c.risk]));
    stmt.free();
    console.log(`[DB] Seeded ${CONJUNCTIONS.length} conjunctions`);
  }

  // Seed demo alerts
  const alertCount = db.exec('SELECT COUNT(*) as c FROM alerts')[0]?.values[0][0];
  if (alertCount === 0) {
    const ALERTS = [
      { type: 'conjunction', severity: 'critical', title: 'CRITICAL CONJUNCTION ALERT', msg: 'COSMOS 2251 DEB × IRIDIUM 33 DEB — Miss distance 1.2km, TCA in 02:14:33', src: 'COLLISION-AVOIDANCE' },
      { type: 'radar',       severity: 'warning',  title: 'UNKNOWN RSO DETECTED',       msg: 'Untracked object at 430km LEO — No catalog match, classification pending', src: 'RADAR-7' },
      { type: 'telemetry',   severity: 'info',     title: 'IRNSS CONSTELLATION NOMINAL',msg: '7/7 IRNSS satellites reporting nominal health — Coverage: INDIA + SUBCONTINENT', src: 'IRNSS-GCS' },
      { type: 'debris',      severity: 'warning',  title: 'NEW DEBRIS CATALOGUED',      msg: 'FENGYUN 1C fragmentation: 12 new objects added to catalog (NORAD IDs: 58210-58221)', src: 'US-SPACE-COM' },
      { type: 'rf',          severity: 'critical', title: 'RF INTERFERENCE DETECTED',   msg: 'Jamming signal on S-band — Origin: 78.3°E, 3.2°N — DRDO NTRO alert issued', src: 'RF-MONITOR' },
    ];
    const stmt = db.prepare(`
      INSERT INTO alerts (type, severity, title, message, source)
      VALUES (?, ?, ?, ?, ?)
    `);
    ALERTS.forEach(a => stmt.run([a.type, a.severity, a.title, a.msg, a.src]));
    stmt.free();
    console.log(`[DB] Seeded ${ALERTS.length} alerts`);
  }

  // Seed default admin user
  const userCount = db.exec('SELECT COUNT(*) as c FROM users')[0]?.values[0][0];
  if (userCount === 0) {
    // password: drdo2024 (pre-hashed SHA256 for demo — in prod use bcrypt)
    db.run(`
      INSERT INTO users (username, password_hash, role, clearance_level)
      VALUES ('admin', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', 'admin', 5),
             ('analyst', 'a4d8d5f0e72b1e89bef1a3dbf11b2c9c1de0f6bdc8a5e5bcaa8afd14cb36ab44', 'analyst', 2)
    `);
    console.log('[DB] Seeded default users (admin/drdo2024, analyst/drdo2024)');
  }
}

// ── Query helpers ──
export function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '\nSQL:', sql);
    return [];
  }
}

export function run(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
    return { success: true, changes: db.getRowsModified() };
  } catch (err) {
    console.error('[DB] Run error:', err.message);
    return { success: false, error: err.message };
  }
}

export function getLastInsertId() {
  const result = db.exec('SELECT last_insert_rowid() as id');
  return result[0]?.values[0][0];
}

// Save DB to disk periodically
export function persistDB() {
  try {
    const data = db.export();
    writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB] Persist error:', err.message);
  }
}

setInterval(persistDB, 30000); // save every 30s
