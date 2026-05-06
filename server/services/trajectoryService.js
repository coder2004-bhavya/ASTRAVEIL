// ═══════════════════════════════════════════════════════
// TRAJECTORY SERVICE — Server-side ballistic math engine
// ═══════════════════════════════════════════════════════

const EARTH_RADIUS_KM = 6371;
const G = 9.80665; // m/s²
const MU = 398600.4418; // Earth gravitational parameter km³/s²

// ── Launch site coordinates ──
const LAUNCH_SITES = {
  sriharikota: { name: 'SDSC SHAR, Sriharikota', lat: 13.7199, lng: 80.2304 },
  chandipur:   { name: 'ITR Chandipur',           lat: 21.4700, lng: 87.0900 },
  pokhran:     { name: 'Pokhran Test Range',       lat: 27.1100, lng: 71.9100 },
  custom:      { name: 'Custom Site',              lat: 20.0,    lng: 75.0   },
};

// ── Target presets ──
const TARGETS = {
  leo:       { name: 'LEO Target',  altKm: 400,   rangeKm: 0    },
  meo:       { name: 'MEO Target',  altKm: 2000,  rangeKm: 0    },
  geo:       { name: 'GEO Target',  altKm: 36000, rangeKm: 0    },
  ballistic: { name: 'Ballistic',   altKm: 500,   rangeKm: 1500 },
};

// ── Ballistic trajectory computation ──
function computeBallisticPath(launchLat, launchLng, targetLat, targetLng, velocityMs, steps = 120) {
  const points = [];
  const Δlat = targetLat - launchLat;
  const Δlng = targetLng - launchLng;
  const rangeKm = haversine(launchLat, launchLng, targetLat, targetLng);

  // Optimal angle for range (simplified flat-Earth ballistic)
  const angle = Math.atan2(velocityMs * velocityMs, G * rangeKm * 1000) / 2;
  const timeOfFlight = (2 * velocityMs * Math.sin(angle)) / G;
  const apogeeKm = (velocityMs * Math.sin(angle)) ** 2 / (2 * G * 1000);

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * timeOfFlight;
    const frac = i / steps;
    const lat = launchLat + Δlat * frac;
    const lng = launchLng + Δlng * frac;
    const altKm = apogeeKm * Math.sin(frac * Math.PI);
    points.push({ lat, lng, altKm: Math.max(0, altKm), t: t.toFixed(1) });
  }

  return { points, apogeeKm, timeOfFlight, rangeKm };
}

// ── Hypersonic trajectory (flatter, faster) ──
function computeHypersonicPath(launchLat, launchLng, targetLat, targetLng, velocityMs, steps = 120) {
  const points = [];
  const Δlat = targetLat - launchLat;
  const Δlng = targetLng - launchLng;
  const rangeKm = haversine(launchLat, launchLng, targetLat, targetLng);
  const timeOfFlight = (rangeKm * 1000) / velocityMs;
  const apogeeKm = rangeKm * 0.05; // Hypersonic is much flatter

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const lat = launchLat + Δlat * frac;
    const lng = launchLng + Δlng * frac;
    // Terminal dive profile
    const altKm = frac < 0.75
      ? apogeeKm * Math.sin(frac / 0.75 * Math.PI * 0.5)
      : apogeeKm * (1 - frac) / 0.25;
    points.push({ lat, lng, altKm: Math.max(0, altKm), t: (frac * timeOfFlight).toFixed(1) });
  }

  return { points, apogeeKm, timeOfFlight, rangeKm };
}

// ── ASAT (direct ascent) ──
function computeASATPath(launchLat, launchLng, targetAltKm, velocityMs, steps = 120) {
  const points = [];
  const timeOfFlight = (targetAltKm * 1000) / velocityMs * 1.4; // gravity losses

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    // Slight ground-track drift
    points.push({
      lat: launchLat + frac * 2,
      lng: launchLng + frac * 0.5,
      altKm: targetAltKm * frac,
      t: (frac * timeOfFlight).toFixed(1),
    });
  }

  return { points, apogeeKm: targetAltKm, timeOfFlight, rangeKm: 0 };
}

// ── MRSAM intercept window ──
function computeInterceptWindow(trajPoints, launchLat, launchLng, mrsamRangeKm = 70, mrsamCeilingKm = 70) {
  // Find trajectory points within MRSAM engagement envelope
  const windows = [];
  for (let i = 0; i < trajPoints.length; i++) {
    const p = trajPoints[i];
    const dist = haversine(launchLat, launchLng, p.lat, p.lng);
    if (dist <= mrsamRangeKm && p.altKm <= mrsamCeilingKm && p.altKm > 0.5) {
      windows.push({ index: i, ...p, dist: dist.toFixed(1) });
    }
  }
  if (windows.length === 0) return null;
  return {
    enterT: windows[0].t,
    exitT:  windows[windows.length - 1].t,
    enterAlt: windows[0].altKm.toFixed(1),
    exitAlt:  windows[windows.length - 1].altKm.toFixed(1),
    windowDuration: (windows[windows.length - 1].t - windows[0].t).toFixed(1),
    engageable: true,
  };
}

// ── Haversine distance ──
function haversine(lat1, lng1, lat2, lng2) {
  const R = EARTH_RADIUS_KM;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Main export ──
export function computeTrajectory(params) {
  const {
    launchSite = 'sriharikota',
    targetType = 'ballistic',
    velocityMs = 3200,
    trajType = 'ballistic',
  } = params;

  const launch = LAUNCH_SITES[launchSite] || LAUNCH_SITES.sriharikota;
  const target = TARGETS[targetType] || TARGETS.ballistic;

  // Target lat/lng (for ballistic, pick a point 1500km NW)
  const targetLat = launch.lat + (trajType === 'asat' ? 2 : 8);
  const targetLng = launch.lng + (trajType === 'asat' ? 0.5 : -12);

  let result;
  if (trajType === 'hypersonic') {
    result = computeHypersonicPath(launch.lat, launch.lng, targetLat, targetLng, velocityMs);
  } else if (trajType === 'asat') {
    result = computeASATPath(launch.lat, launch.lng, target.altKm || 400, velocityMs);
  } else {
    result = computeBallisticPath(launch.lat, launch.lng, targetLat, targetLng, velocityMs);
  }

  const intercept = trajType !== 'asat'
    ? computeInterceptWindow(result.points, launch.lat, launch.lng)
    : { engageable: false, note: 'BEYOND MRSAM CEILING' };

  const machNumber = velocityMs / 343;

  return {
    launchSite: launch.name,
    launchLat: launch.lat,
    launchLng: launch.lng,
    targetType: target.name,
    targetLat,
    targetLng,
    trajType,
    velocityMs,
    apogeeKm: parseFloat(result.apogeeKm.toFixed(1)),
    flightTimeS: parseFloat(result.timeOfFlight.toFixed(1)),
    rangeKm: parseFloat(result.rangeKm.toFixed(1)),
    machNumber: parseFloat(machNumber.toFixed(1)),
    interceptWindow: intercept,
    pointCount: result.points.length,
    path: result.points,
  };
}

export { LAUNCH_SITES, TARGETS };
