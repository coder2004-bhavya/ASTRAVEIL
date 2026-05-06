// ═══════════════════════════════════════════════════════
// ORBITAL MODULE — Globe.gl + Real TLE Satellite Tracker
// ═══════════════════════════════════════════════════════

import {
  parseTLEText,
  getSatPosition,
  classifySatellite,
  getOrbitalParams,
  fetchWithTimeout,
  DEMO_SATELLITES,
  TLE_SOURCES,
} from '../utils/tle.js';

let globeInstance = null;
let allSatellites = [];
let satRecords = [];
let propagateTimer = null;
let currentFilter = 'all';

export async function initOrbital() {
  const container = document.getElementById('globe-container');
  if (!container || typeof Globe === 'undefined') return;

  setupGlobe(container);
  await loadSatellites();
  setupSatList();
  setupFilters();

  // Re-propagate positions every 3 seconds
  propagateTimer = setInterval(updateSatPositions, 3000);
}

// ── Setup Globe.gl ──
function setupGlobe(container) {
  globeInstance = Globe({ animateIn: true })
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
    .atmosphereColor('#00f5ff')
    .atmosphereAltitude(0.18)
    .pointAltitude('alt')
    .pointColor('color')
    .pointRadius(0.25)
    .pointsMerge(false)
    .pointLabel(d => `
      <div style="
        font-family: 'Share Tech Mono', monospace;
        background: rgba(2,8,24,0.92);
        border: 1px solid ${d.color};
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 11px;
        color: ${d.color};
        white-space: nowrap;
      ">
        <div style="font-weight:700;margin-bottom:4px;">${d.label}</div>
        <div style="color:#7ea8cc">TYPE: ${d.classification.label}</div>
        <div style="color:#7ea8cc">ALT: ${d.altKm ? d.altKm.toFixed(0) + ' km' : '—'}</div>
        <div style="color:#7ea8cc">LAT: ${d.lat?.toFixed(2)}° | LNG: ${d.lng?.toFixed(2)}°</div>
      </div>
    `)
    .onPointClick((sat) => {
      if (!sat) return;
      window.ASTRAVEIL.selectedSat = sat;
      updateModalDetails(sat);
      window.openModal('orbital-modal');
    })
    (container);

  globeInstance.controls().autoRotate = true;
  globeInstance.controls().autoRotateSpeed = 0.4;
  globeInstance.controls().enableDamping = true;

  // Style
  globeInstance.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// ── Load satellite TLE data ──
async function loadSatellites() {
  const satList = document.getElementById('sat-list');
  satList.innerHTML = '<div class="sat-loading">FETCHING CELESTRAK DATA...</div>';

  let rawSats = [];

  // Try live API first
  try {
    const text = await fetchWithTimeout(TLE_SOURCES.visual, 7000);
    rawSats = parseTLEText(text);
    if (rawSats.length === 0) throw new Error('Empty response');
    console.log(`[ASTRAVEIL] Loaded ${rawSats.length} satellites from CelesTrak`);
  } catch (err) {
    console.warn('[ASTRAVEIL] CelesTrak fetch failed, using demo data:', err.message);
    rawSats = DEMO_SATELLITES;
  }

  // Build satellite records with satrec + classification
  allSatellites = [];
  satRecords = [];

  for (const raw of rawSats.slice(0, 150)) { // limit for performance
    try {
      const satrec = satellite.twoline2satrec(raw.line1, raw.line2);
      const classification = classifySatellite(raw.name);
      const pos = getSatPosition(satrec);
      if (!pos) continue;

      const satObj = {
        name: raw.name,
        label: raw.name,
        classification,
        color: classification.color,
        satrec,
        lat: pos.lat,
        lng: pos.lng,
        // Globe.gl altitude = fraction of globe radius (6371km)
        // ISS at 408km → 408/6371 ≈ 0.064; GEO at 35786km → ~5.6 (capped to 1.0 for display)
        alt: Math.min(pos.alt / 6371, 1.0),
        altKm: pos.alt, // store raw km for display
      };

      allSatellites.push(satObj);
      satRecords.push(satObj);
    } catch {
      // Skip malformed TLE
    }
  }

  document.getElementById('sat-count').textContent = `${allSatellites.length} OBJECTS`;

  updateGlobePoints();
  renderSatList(allSatellites.slice(0, 30));
}

// ── Update positions via propagation ──
function updateSatPositions() {
  const now = new Date();

  allSatellites.forEach(sat => {
    const pos = getSatPosition(sat.satrec, now);
    if (pos) {
      sat.lat = pos.lat;
      sat.lng = pos.lng;
      sat.alt = Math.min(pos.alt / 6371, 1.0);
      sat.altKm = pos.alt;
    }
  });

  updateGlobePoints();
}

// ── Push updated data to globe ──
function updateGlobePoints() {
  if (!globeInstance) return;

  const filtered = currentFilter === 'all'
    ? allSatellites
    : allSatellites.filter(s => s.classification.type === currentFilter);

  globeInstance.pointsData(filtered);
}

// ── Render satellite list panel ──
function renderSatList(sats) {
  const list = document.getElementById('sat-list');
  list.innerHTML = '';

  sats.forEach(sat => {
    const item = document.createElement('div');
    item.className = 'sat-item';
    item.innerHTML = `
      <div class="sat-dot" style="background:${sat.color}"></div>
      <div class="sat-info">
        <div class="sat-name">${sat.name}</div>
        <div class="sat-meta">${sat.classification.label} · ${sat.lat?.toFixed(1)}°, ${sat.lng?.toFixed(1)}°</div>
      </div>
      <div class="sat-alt">${sat.altKm ? sat.altKm.toFixed(0) + ' km' : '—'}</div>
    `;
    item.addEventListener('click', () => {
      window.ASTRAVEIL.selectedSat = sat;
      updateModalDetails(sat);
      window.openModal('orbital-modal');
      // Point globe at satellite
      globeInstance.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: 2 }, 1000);
    });
    list.appendChild(item);
  });
}

function setupSatList() {
  renderSatList(allSatellites.slice(0, 30));
}

// ── Filter buttons ──
function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;

      const filtered = currentFilter === 'all'
        ? allSatellites
        : allSatellites.filter(s => s.classification.type === currentFilter);

      renderSatList(filtered.slice(0, 30));
      updateGlobePoints();
    });
  });
}

// ── Update modal with satellite details ──
function updateModalDetails(sat) {
  if (!sat || !sat.satrec) return;
  const params = getOrbitalParams(sat.satrec);

  document.getElementById('m-norad').textContent   = params.noradId || '—';
  document.getElementById('m-incl').textContent    = params.inclination || '—';
  document.getElementById('m-ecc').textContent     = params.eccentricity || '—';
  document.getElementById('m-period').textContent  = params.period || '—';
  document.getElementById('m-apogee').textContent  = params.apogee || '—';
  document.getElementById('m-perigee').textContent = params.perigee || '—';
  document.getElementById('m-motion').textContent  = params.meanMotion || '—';

  const modalBody = document.getElementById('orbital-modal-body');
  if (modalBody) {
    const h = modalBody.querySelector('p');
    if (h) h.textContent = `Orbital parameters for ${sat.name} — ${sat.classification.label} class object.`;
  }
}
