// ═══════════════════════════════════════════════════════
// API CLIENT — Frontend ↔ Backend communication
// REST API + WebSocket live feed
// ═══════════════════════════════════════════════════════

const API_BASE = 'http://localhost:3001/api';
const WS_URL   = 'ws://localhost:3001/ws';

// ── REST helpers ──
async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    return await res.json();
  } catch (err) {
    console.warn(`[API] ${path} failed:`, err.message);
    return { success: false, error: err.message };
  }
}

export const api = {
  // Satellites
  getSatellites:   (params = {}) => apiFetch('/satellites?' + new URLSearchParams(params)),
  getSatellite:    (noradId) => apiFetch(`/satellites/${noradId}`),
  getSatStats:     () => apiFetch('/satellites/stats'),
  getTLE:          (source) => fetch(`${API_BASE}/satellites/tle/${source}`).then(r => r.text()),
  addWatchlist:    (noradId, satName, notes) => apiFetch('/satellites/watchlist', {
    method: 'POST', body: JSON.stringify({ noradId, satName, notes }),
  }),
  getWatchlist:    () => apiFetch('/satellites/watchlist/me'),

  // Conjunctions
  getConjunctions: (params = {}) => apiFetch('/conjunctions?' + new URLSearchParams(params)),
  getCritical:     () => apiFetch('/conjunctions/critical'),

  // Alerts
  getAlerts:       (params = {}) => apiFetch('/alerts?' + new URLSearchParams(params)),
  markRead:        (id) => apiFetch(`/alerts/${id}/read`, { method: 'PATCH' }),
  markAllRead:     () => apiFetch('/alerts/read-all', { method: 'PATCH' }),

  // Trajectory
  computeTrajectory: (params) => apiFetch('/trajectory/compute', {
    method: 'POST', body: JSON.stringify(params),
  }),
  getTrajectoryHistory: () => apiFetch('/trajectory/history'),

  // Auth
  login:  (username, password) => apiFetch('/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  }),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  getMe:  () => apiFetch('/auth/me'),

  // Health
  health: () => apiFetch('http://localhost:3001/health'.replace(API_BASE, '')),
};

// ════════════════════════════════════
// WEBSOCKET CLIENT
// ════════════════════════════════════
let ws = null;
let wsReconnectTimer = null;
const wsListeners = {};

export function initWebSocketClient() {
  connectWS();
}

function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[WS] Connected to ASTRAVEIL server');
    clearTimeout(wsReconnectTimer);
    updateConnectionBadge(true);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch {}
  };

  ws.onclose = () => {
    console.warn('[WS] Disconnected — reconnecting in 5s...');
    updateConnectionBadge(false);
    wsReconnectTimer = setTimeout(connectWS, 5000);
  };

  ws.onerror = () => {
    updateConnectionBadge(false);
  };
}

function handleServerMessage(msg) {
  // Fire registered listeners
  const listeners = wsListeners[msg.event] || [];
  listeners.forEach(fn => fn(msg.data));

  // Built-in handlers
  switch (msg.event) {
    case 'ALERT': {
      injectLiveAlert(msg.data);
      updateAlertBadge();
      break;
    }
    case 'TELEMETRY': {
      updateLiveTelemetry(msg.data);
      break;
    }
    case 'CONJUNCTION_ALERT': {
      injectConjunctionAlert(msg.data);
      break;
    }
    case 'TRAJECTORY_SIMULATED': {
      console.log('[WS] Trajectory simulated:', msg.data?.sessionId);
      break;
    }
    case 'STATS': {
      updateLiveStats(msg.data);
      break;
    }
  }
}

export function onWsEvent(event, callback) {
  if (!wsListeners[event]) wsListeners[event] = [];
  wsListeners[event].push(callback);
}

export function wsSend(event, data = {}) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, ...data }));
  }
}

// ── Update UI from WebSocket ──

function updateConnectionBadge(connected) {
  const dot = document.querySelector('.nav-status .status-dot');
  const text = document.querySelector('.nav-status .status-text');
  if (!dot || !text) return;

  if (connected) {
    dot.style.background = '#00ff9d';
    dot.style.boxShadow = '0 0 8px #00ff9d';
    text.textContent = 'LIVE';
    text.style.color = '#00ff9d';
  } else {
    dot.style.background = '#ff2d55';
    dot.style.boxShadow = '0 0 8px #ff2d55';
    text.textContent = 'OFFLINE';
    text.style.color = '#ff2d55';
  }
}

function injectLiveAlert(alert) {
  const feed = document.getElementById('alert-feed');
  if (!feed) return;

  const ts = new Date(alert.timestamp || Date.now()).toISOString().slice(11, 19) + ' UTC';
  const div = document.createElement('div');
  div.className = `alert-item ${alert.severity || 'info'}`;
  div.style.borderLeft = `2px solid ${severityColor(alert.severity)}`;
  div.innerHTML = `
    <span class="alert-time">${ts} · ${alert.source || 'SYSTEM'}</span>
    <strong>${alert.title}</strong><br>${alert.message}
  `;

  feed.insertBefore(div, feed.firstChild);
  while (feed.children.length > 15) feed.removeChild(feed.lastChild);

  // Flash the mission section badge
  flashBadge();
}

function injectConjunctionAlert(conj) {
  // Re-fetch conjunction list if visible
  const conjList = document.getElementById('conjunction-list');
  if (conjList) {
    const div = document.createElement('div');
    div.className = `conjunction-item ${conj.risk_level}`;
    div.innerHTML = `
      <div class="conj-header">
        <span>${conj.obj1_name} × ${conj.obj2_name}</span>
        <span class="conj-risk">${conj.probability}</span>
      </div>
      <div class="conj-detail">Miss: ${conj.miss_distance_km}km · ${conj.tca}</div>
    `;
    conjList.insertBefore(div, conjList.children[1]);
  }
}

function updateLiveTelemetry(data) {
  // Expose for mission.js charts to pick up
  window.ASTRAVEIL.liveTelementry = data;
}

function updateAlertBadge() {
  // Flash nav
  const navTime = document.getElementById('nav-clock');
  if (navTime) {
    navTime.style.color = '#ff2d55';
    setTimeout(() => { navTime.style.color = ''; }, 800);
  }
}

function updateLiveStats(stats) {
  if (stats.activeSatellites) {
    const el = document.querySelector('.stat-value[data-target="842"]');
    if (el && stats.activeSatellites > 0) el.textContent = stats.activeSatellites.toLocaleString();
  }
}

function flashBadge() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  navbar.style.borderBottomColor = '#ff2d55';
  setTimeout(() => { navbar.style.borderBottomColor = ''; }, 600);
}

function severityColor(s) {
  return s === 'critical' ? '#ff2d55' : s === 'warning' ? '#ff6b35' : '#00f5ff';
}

// ── Load initial data from backend on startup ──
export async function loadBackendData() {
  try {
    // Check if backend is up
    const health = await fetch('http://localhost:3001/health').then(r => r.json()).catch(() => null);
    if (!health || health.status !== 'ONLINE') {
      console.warn('[API] Backend offline — using frontend-only mode');
      return;
    }

    console.log('[API] Backend online — loading server data');

    // Load alerts into feed
    const alerts = await api.getAlerts({ limit: 8 });
    if (alerts.success && alerts.data) {
      const feed = document.getElementById('alert-feed');
      if (feed) {
        feed.innerHTML = '';
        alerts.data.forEach(a => {
          const ts = new Date(a.created_at * 1000).toISOString().slice(11, 19) + ' UTC';
          const div = document.createElement('div');
          div.className = `alert-item ${a.severity}`;
          div.innerHTML = `<span class="alert-time">${ts} · ${a.source}</span><strong>${a.title}</strong><br>${a.message}`;
          feed.appendChild(div);
        });
      }
    }

    // Load conjunction data
    const conjs = await api.getCritical();
    if (conjs.success && conjs.data) {
      const list = document.getElementById('conjunction-list');
      if (list) {
        list.innerHTML = '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:8px;letter-spacing:.2em">CRITICAL CONJUNCTIONS — LIVE FROM DB</div>';
        conjs.data.forEach(c => {
          const div = document.createElement('div');
          div.className = `conjunction-item ${c.risk_level}`;
          div.innerHTML = `
            <div class="conj-header"><span>${c.obj1_name}</span><span class="conj-risk ${c.risk_level !== 'critical' ? 'high' : ''}">${c.probability}</span></div>
            <div class="conj-detail">${c.obj2_name} · Miss: ${c.miss_distance_km}km · ${c.tca}</div>
          `;
          list.appendChild(div);
        });
      }
    }

    // Load sat stats
    const stats = await api.getSatStats();
    if (stats.success) {
      const el = document.getElementById('sat-count');
      if (el) el.textContent = `${stats.data.active} OBJECTS`;
    }

    console.log('[API] Backend data loaded successfully');
  } catch (err) {
    console.warn('[API] Backend data load failed:', err.message);
  }
}
