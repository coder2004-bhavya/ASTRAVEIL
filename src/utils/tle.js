// ═══════════════════════════════════════════════════════
// TLE UTILITY — Fetch & Parse CelesTrak Data
// ═══════════════════════════════════════════════════════

// CORS proxy to allow browser fetching of TLE text files
const CORS_PROXY = 'https://corsproxy.io/?';

export const TLE_SOURCES = {
  stations: `${CORS_PROXY}https://celestrak.org/SOCRATES/query.php?CATALOG=stations&FORMAT=TLE`,
  visual:   `${CORS_PROXY}https://celestrak.org/pub/TLE/visual.txt`,
  active:   `${CORS_PROXY}https://celestrak.org/pub/TLE/active.txt`,
  irnss:    `${CORS_PROXY}https://celestrak.org/pub/TLE/irnss.txt`,
  gps:      `${CORS_PROXY}https://celestrak.org/pub/TLE/gps-ops.txt`,
};

// ── Parse raw TLE text into array of {name, line1, line2} objects ──
export function parseTLEText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const satellites = [];

  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    // Basic TLE validation
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
      // Try 2-line format (no name)
      continue;
    }

    satellites.push({ name: name.replace(/^0 /, ''), line1, line2 });
  }

  return satellites;
}

// ── Extract orbital parameters from TLE ──
export function getOrbitalParams(satrec) {
  if (!satrec) return {};

  const meanMotion = satrec.no * (24 * 60) / (2 * Math.PI); // rev/day
  const period = 1440 / meanMotion; // minutes
  const a = Math.pow(8681663.653 / satrec.no, 2 / 3); // semi-major axis km
  const apogee  = a * (1 + satrec.ecco) - 6371;
  const perigee = a * (1 - satrec.ecco) - 6371;

  return {
    inclination: (satrec.inclo * 180 / Math.PI).toFixed(2) + '°',
    eccentricity: satrec.ecco.toFixed(6),
    period: period.toFixed(1) + ' min',
    apogee: apogee.toFixed(0) + ' km',
    perigee: perigee.toFixed(0) + ' km',
    meanMotion: meanMotion.toFixed(4) + ' rev/day',
    noradId: satrec.satnum,
  };
}

// ── Propagate satellite to current position ──
export function getSatPosition(satrec, date = new Date()) {
  try {
    const posVel = satellite.propagate(satrec, date);
    if (!posVel.position) return null;

    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(posVel.position, gmst);

    return {
      lat: satellite.degreesLat(geo.latitude),
      lng: satellite.degreesLong(geo.longitude),
      alt: geo.height, // km
    };
  } catch {
    return null;
  }
}

// ── Classify satellite by name ──
export function classifySatellite(name) {
  const n = name.toUpperCase();
  if (n.includes('ISS') || n.includes('STATION') || n.includes('CSS')) {
    return { type: 'station', color: '#00f5ff', label: 'STATION' };
  }
  if (n.includes('GPS') || n.includes('NAVSTAR') || n.includes('IRNSS') || n.includes('GLONASS') || n.includes('GALILEO') || n.includes('BEIDOU')) {
    return { type: 'navigation', color: '#ffd700', label: 'NAV' };
  }
  if (n.includes('INSAT') || n.includes('GSAT') || n.includes('ISAT') || n.includes('TELSTAR') || n.includes('STAR')) {
    return { type: 'comms', color: '#ff6b35', label: 'COMMS' };
  }
  if (n.includes('DEBRIS') || n.includes('R/B') || n.includes('DEB') || n.includes('ROCKET')) {
    return { type: 'debris', color: '#ff2d55', label: 'DEBRIS' };
  }
  return { type: 'unknown', color: '#7ea8cc', label: 'UNK' };
}

// ── Fetch with timeout ──
export async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return await res.text();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ── Fallback demo satellites (if API fails) ──
export const DEMO_SATELLITES = [
  {
    name: 'ISS (ZARYA)',
    line1: '1 25544U 98067A   24001.00000000  .00003000  00000-0  51000-4 0  9999',
    line2: '2 25544  51.6400 287.6800 0001000  17.0000 343.0000 15.50000000000000',
  },
  {
    name: 'NAVSTAR GPS SVN-77',
    line1: '1 40730U 15033A   24001.00000000 -.00000030  00000-0  00000-0 0  9999',
    line2: '2 40730  54.8000 160.0000 0100000  30.0000 330.0000  2.00550000000000',
  },
  {
    name: 'IRNSS-1A',
    line1: '1 39199U 13034A   24001.00000000 -.00000264  00000-0  00000-0 0  9999',
    line2: '2 39199  29.0000  55.0000 0010000  10.0000 350.0000  1.00270000000000',
  },
  {
    name: 'GSAT-30',
    line1: '1 45026U 20005A   24001.00000000 -.00000299  00000-0  00000-0 0  9999',
    line2: '2 45026   0.0200  82.0000 0003000  10.0000 350.0000  1.00270000000000',
  },
  {
    name: 'CARTOSAT-3',
    line1: '1 44793U 19073A   24001.50000000  .00001800  00000-0  44000-4 0  9999',
    line2: '2 44793  97.8700 108.0000 0000900  85.0000 275.0000 14.95000000000000',
  },
  {
    name: 'DEBRIS 2007-007',
    line1: '1 29228U 07007D   24001.00000000  .00000100  00000-0  50000-4 0  9999',
    line2: '2 29228  97.5500  20.0000 0010000 180.0000 180.0000 14.80000000000000',
  },
  {
    name: 'RISAT-2B',
    line1: '1 44233U 19028A   24001.00000000  .00001100  00000-0  30000-4 0  9999',
    line2: '2 44233  37.0000  85.0000 0000800  90.0000 270.0000 15.00000000000000',
  },
  {
    name: 'RESOURCESAT-2',
    line1: '1 37387U 11008A   24001.00000000  .00000900  00000-0  23000-4 0  9999',
    line2: '2 37387  98.6900 110.0000 0002000 100.0000 260.0000 14.56000000000000',
  },
  {
    name: 'GLONASS-M 756',
    line1: '1 32275U 07065A   24001.00000000 -.00000010  00000-0  00000-0 0  9999',
    line2: '2 32275  65.1000 290.0000 0010000 180.0000 180.0000  2.13120000000000',
  },
  {
    name: 'STARLINK-1007',
    line1: '1 44713U 19074A   24001.50000000  .00007000  00000-0  45000-4 0  9999',
    line2: '2 44713  53.0000 110.0000 0001400 150.0000 210.0000 15.06000000000000',
  },
];
