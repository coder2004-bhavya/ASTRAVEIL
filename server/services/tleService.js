// ═══════════════════════════════════════════════════════
// TLE SERVICE — Fetches, caches, and parses TLE data
// Runs as background job every 6 hours
// ═══════════════════════════════════════════════════════

import fetch from 'node-fetch';
import { query, run } from '../db/database.js';

const TLE_SOURCES = {
  visual:   'https://celestrak.org/pub/TLE/visual.txt',
  stations: 'https://celestrak.org/pub/TLE/stations.txt',
  irnss:    'https://celestrak.org/pub/TLE/irnss.txt',
  gps:      'https://celestrak.org/pub/TLE/gps-ops.txt',
  active:   'https://celestrak.org/pub/TLE/active.txt',
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Parse TLE text to array of objects ──
export function parseTLEText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sats = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i].replace(/^0 /, '');
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;
    const noradId = line2.substring(2, 7).trim();
    sats.push({ name, line1, line2, noradId });
  }
  return sats;
}

// ── Fetch one TLE source with timeout ──
async function fetchTLE(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ── Refresh TLE cache from CelesTrak ──
export async function refreshTLECache() {
  console.log('[TLE] Refreshing TLE cache from CelesTrak...');
  const results = {};

  for (const [source, url] of Object.entries(TLE_SOURCES)) {
    try {
      const text = await fetchTLE(url);
      const sats = parseTLEText(text);

      // Store raw in DB cache
      run(
        `INSERT INTO tle_cache (source, raw_text) VALUES (?, ?)`,
        [source, text]
      );

      // Trim old cache entries (keep last 3 per source)
      run(
        `DELETE FROM tle_cache WHERE source = ? AND id NOT IN (
          SELECT id FROM tle_cache WHERE source = ? ORDER BY fetched_at DESC LIMIT 3
        )`,
        [source, source]
      );

      // Update satellite records
      let updated = 0;
      for (const sat of sats.slice(0, 200)) {
        const result = run(
          `INSERT INTO satellites (norad_id, name, line1, line2, type)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(norad_id) DO UPDATE SET
             name = excluded.name,
             line1 = excluded.line1,
             line2 = excluded.line2,
             last_updated = strftime('%s','now')`,
          [sat.noradId, sat.name, sat.line1, sat.line2, classifySat(sat.name)]
        );
        if (result.success) updated++;
      }

      results[source] = { count: sats.length, updated };
      console.log(`[TLE] ${source}: ${sats.length} satellites fetched, ${updated} updated`);
    } catch (err) {
      console.warn(`[TLE] Failed to fetch ${source}: ${err.message}`);
      results[source] = { error: err.message };
    }
  }

  return results;
}

// ── Get TLE data from DB cache ──
export function getCachedTLE(source = 'visual') {
  const rows = query(
    `SELECT raw_text, fetched_at FROM tle_cache
     WHERE source = ? ORDER BY fetched_at DESC LIMIT 1`,
    [source]
  );
  if (!rows.length) return null;
  return {
    text: rows[0].raw_text,
    fetchedAt: rows[0].fetched_at,
    isStale: (Date.now() / 1000 - rows[0].fetched_at) > (CACHE_TTL_MS / 1000),
  };
}

// ── Get all satellites from DB ──
export function getAllSatellites(limit = 200) {
  return query(
    `SELECT * FROM satellites WHERE is_active = 1 ORDER BY last_updated DESC LIMIT ?`,
    [limit]
  );
}

// ── Classify satellite type by name ──
export function classifySat(name) {
  const n = name.toUpperCase();
  if (n.includes('ISS') || n.includes('STATION') || n.includes('TIANGONG')) return 'station';
  if (n.includes('GPS') || n.includes('NAVSTAR') || n.includes('IRNSS') ||
      n.includes('GLONASS') || n.includes('GALILEO') || n.includes('BEIDOU')) return 'navigation';
  if (n.includes('GSAT') || n.includes('INSAT') || n.includes('TELSTAR') ||
      n.includes('INTELSAT') || n.includes('SES-')) return 'comms';
  if (n.includes('DEBRIS') || n.includes('R/B') || n.includes('DEB') ||
      n.includes('ROCKET') || n.includes('FRAG')) return 'debris';
  if (n.includes('CARTOSAT') || n.includes('RISAT') || n.includes('RESOURCESAT') ||
      n.includes('LANDSAT') || n.includes('SENTINEL')) return 'earth_obs';
  return 'unknown';
}

// ── Start background refresh job ──
export function startTLERefreshJob() {
  // Initial fetch
  refreshTLECache().catch(err => console.warn('[TLE] Initial fetch failed:', err.message));

  // Refresh every 6 hours
  setInterval(() => {
    refreshTLECache().catch(err => console.warn('[TLE] Scheduled refresh failed:', err.message));
  }, CACHE_TTL_MS);

  console.log('[TLE] Background refresh job started (every 6h)');
}
