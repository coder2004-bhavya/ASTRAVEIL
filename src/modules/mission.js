// ═══════════════════════════════════════════════════════
// MISSION MODULE — Mission Control HUD
// Radar sweep, telemetry charts, alert feed, system status
// ═══════════════════════════════════════════════════════

export function initMission() {
  initRadar();
  initTelemetryChart();
  initDensityChart();
  initConstellationChart();
  initStatusGrid();
  startAlertFeed();
}

// ════════════════════════════════════
// RADAR SWEEP
// ════════════════════════════════════
function initRadar() {
  const canvas = document.getElementById('radar-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, R = W / 2 - 4;

  // Blips: random objects detected
  const blips = Array.from({ length: 8 }, () => ({
    angle: Math.random() * Math.PI * 2,
    dist:  0.2 + Math.random() * 0.75,
    size:  1.5 + Math.random() * 3,
    life:  1,
    type:  Math.random() > 0.7 ? 'threat' : 'track',
  }));

  let sweepAngle = 0;

  function drawRadar() {
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#020818';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Range rings
    [0.25, 0.5, 0.75, 1.0].forEach(frac => {
      ctx.beginPath();
      ctx.arc(cx, cy, R * frac, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(13,36,68,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Cross hairs
    ctx.strokeStyle = 'rgba(13,36,68,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();

    // Diagonal guides
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.707, cy - R * 0.707);
    ctx.lineTo(cx + R * 0.707, cy + R * 0.707);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + R * 0.707, cy - R * 0.707);
    ctx.lineTo(cx - R * 0.707, cy + R * 0.707);
    ctx.stroke();

    // Sweep gradient trailing glow — drawn as fading arcs below

    // Manual sweep arc glow
    for (let i = 0; i < 40; i++) {
      const a = sweepAngle - (i / 40) * 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R - 2, a, a + 0.05);
      ctx.closePath();
      ctx.fillStyle = `rgba(0, 245, 255, ${(1 - i / 40) * 0.12})`;
      ctx.fill();
    }

    // Sweep line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (R - 2) * Math.cos(sweepAngle), cy + (R - 2) * Math.sin(sweepAngle));
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Blips
    blips.forEach(blip => {
      const bx = cx + R * blip.dist * Math.cos(blip.angle);
      const by = cy + R * blip.dist * Math.sin(blip.angle);

      // Fade based on angle distance from sweep
      let angleDiff = sweepAngle - blip.angle;
      while (angleDiff < 0) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI * 2) angleDiff -= Math.PI * 2;

      const fade = Math.max(0, 1 - angleDiff / (Math.PI * 2));

      if (angleDiff < 0.1) {
        // Just swept over — flash bright
        blip.life = 1;
      } else {
        blip.life = Math.max(0.05, blip.life - 0.002);
      }

      const col = blip.type === 'threat' ? `rgba(255, 45, 85, ${blip.life})` : `rgba(0, 245, 255, ${blip.life})`;
      ctx.beginPath();
      ctx.arc(bx, by, blip.size, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();

      // Glow ring
      ctx.beginPath();
      ctx.arc(bx, by, blip.size + 3, 0, Math.PI * 2);
      ctx.strokeStyle = col.replace(blip.life.toString(), (blip.life * 0.3).toFixed(2));
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Outer border
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#0d2444';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00f5ff';
    ctx.fill();

    // Range labels
    ctx.font = '9px "Share Tech Mono"';
    ctx.fillStyle = 'rgba(61,96,128,0.8)';
    ctx.textAlign = 'center';
    ['500km', '1000km', '1500km', '2000km'].forEach((label, i) => {
      ctx.fillText(label, cx + 2, cy - R * (i + 1) * 0.25 + 3);
    });

    sweepAngle += 0.025;
    if (sweepAngle > Math.PI * 2) {
      sweepAngle -= Math.PI * 2;
      // Randomize blips slightly
      blips.forEach(blip => {
        if (Math.random() > 0.7) {
          blip.angle = Math.random() * Math.PI * 2;
          blip.dist  = 0.2 + Math.random() * 0.75;
        }
      });
    }

    requestAnimationFrame(drawRadar);
  }

  drawRadar();
}

// ════════════════════════════════════
// TELEMETRY CHART
// ════════════════════════════════════
function initTelemetryChart() {
  const canvas = document.getElementById('telemetry-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = Array.from({ length: 30 }, (_, i) => i);
  const signalData   = Array.from({ length: 30 }, () => 85 + Math.random() * 15);
  const latencyData  = Array.from({ length: 30 }, () => 10 + Math.random() * 40);

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Signal Strength (%)',
          data: signalData,
          borderColor: '#00f5ff',
          backgroundColor: 'rgba(0,245,255,0.05)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
        },
        {
          label: 'Latency (ms)',
          data: latencyData,
          borderColor: '#ff6b35',
          backgroundColor: 'rgba(255,107,53,0.03)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 1.5,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          labels: { color: '#3d6080', font: { family: 'Share Tech Mono', size: 9 } }
        },
      },
      scales: {
        x: { display: false },
        y: {
          min: 50, max: 105,
          ticks: { color: '#3d6080', font: { family: 'Share Tech Mono', size: 9 } },
          grid: { color: 'rgba(13,36,68,0.8)' },
        },
        y2: {
          position: 'right',
          min: 0, max: 100,
          ticks: { color: '#3d6080', font: { family: 'Share Tech Mono', size: 9 } },
          grid: { display: false },
        },
      },
    },
  });

  // Live update
  setInterval(() => {
    chart.data.datasets[0].data.push(85 + Math.random() * 15);
    chart.data.datasets[0].data.shift();
    chart.data.datasets[1].data.push(10 + Math.random() * 40);
    chart.data.datasets[1].data.shift();
    chart.update('none');
  }, 1500);
}

// ════════════════════════════════════
// DEBRIS DENSITY vs ALTITUDE
// ════════════════════════════════════
function initDensityChart() {
  const canvas = document.getElementById('density-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['200','400','600','800','1000','1200','1500','2000','MEO','GEO'],
      datasets: [{
        label: 'Objects/100km³',
        data: [120, 980, 2400, 1800, 1200, 600, 300, 150, 80, 200],
        backgroundColor: [
          '#00f5ff','#00f5ff','#ff2d55','#ff6b35','#ff6b35',
          '#ffd700','#ffd700','#00f5ff','#3d6080','#ffd700'
        ],
        borderRadius: 2,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#3d6080', font: { family: 'Share Tech Mono', size: 8 } }, grid: { display: false } },
        y: { ticks: { color: '#3d6080', font: { family: 'Share Tech Mono', size: 8 } }, grid: { color: 'rgba(13,36,68,0.8)' } },
      },
    },
  });
}

// ════════════════════════════════════
// CONSTELLATION OVERVIEW (Doughnut)
// ════════════════════════════════════
function initConstellationChart() {
  const canvas = document.getElementById('constellation-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['LEO Comm', 'GPS/GNSS', 'GEO', 'IRNSS', 'ISS/Stations', 'Debris', 'Other'],
      datasets: [{
        data: [3200, 140, 580, 7, 12, 23000, 1200],
        backgroundColor: ['#00f5ff','#ffd700','#ff6b35','#00ff9d','#0088aa','#ff2d55','#3d6080'],
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#3d6080', font: { family: 'Share Tech Mono', size: 8 }, boxWidth: 8, padding: 6 },
        },
      },
    },
  });
}

// ════════════════════════════════════
// SUBSYSTEM STATUS GRID
// ════════════════════════════════════
const SUBSYSTEMS = [
  { name: 'TRK-SYS', status: 'ok' },
  { name: 'RADAR-1', status: 'ok' },
  { name: 'RADAR-2', status: 'ok' },
  { name: 'COMMS-A', status: 'ok' },
  { name: 'COMMS-B', status: 'warn' },
  { name: 'GPS-RCV', status: 'ok' },
  { name: 'IRNSS-1', status: 'ok' },
  { name: 'CRYPTO',  status: 'ok' },
  { name: 'SENSOR',  status: 'ok' },
  { name: 'BACKUP',  status: 'ok' },
  { name: 'POWER',   status: 'ok' },
  { name: 'COOLING', status: 'warn' },
];

function initStatusGrid() {
  const grid = document.getElementById('status-grid');
  if (!grid) return;

  grid.innerHTML = '';
  SUBSYSTEMS.forEach(sys => {
    const div = document.createElement('div');
    div.className = 'status-item';
    div.innerHTML = `
      <div class="status-indicator ${sys.status}"></div>
      <span>${sys.name}</span>
    `;
    grid.appendChild(div);
  });

  // Occasionally flip a system to warn/ok
  setInterval(() => {
    const idx = Math.floor(Math.random() * SUBSYSTEMS.length);
    const items = grid.querySelectorAll('.status-item');
    const ind = items[idx]?.querySelector('.status-indicator');
    if (!ind) return;
    const current = SUBSYSTEMS[idx].status;
    if (current === 'warn' && Math.random() > 0.4) {
      SUBSYSTEMS[idx].status = 'ok';
      ind.className = 'status-indicator ok';
    } else if (current === 'ok' && Math.random() > 0.85) {
      SUBSYSTEMS[idx].status = 'warn';
      ind.className = 'status-indicator warn';
    }
  }, 4000);
}

// ════════════════════════════════════
// INTELLIGENCE ALERT FEED
// ════════════════════════════════════
const ALERT_POOL = [
  { type: 'critical', text: '[ALERT] RADAR-7: Anomalous object detected at 847km LEO · TCA: 02:14:33 UTC' },
  { type: 'warning',  text: '[WARN] SL-8 R/B conjunction alert · Miss distance: 3.7km · Probability: 1:1240' },
  { type: 'info',     text: '[INFO] ISS pass over SDSC SHAR in T-12:43 · Elevation: 47°' },
  { type: 'critical', text: '[ALERT] FENGYUN 1C debris cluster — 12 new fragments catalogued (NORAD)' },
  { type: 'warning',  text: '[WARN] NAVSTAR GPS SVN-77 signal degradation detected · SNR: -3dB' },
  { type: 'info',     text: '[INFO] IRNSS constellation: 7/7 satellites nominal · Coverage: NOMINAL' },
  { type: 'critical', text: '[ALERT] COSMOS 2251 debris · Predicted conjunction with CARTOSAT-3 in 48h' },
  { type: 'info',     text: '[INFO] Ground station BENGALURU — uplink confirmed · Freq: 2.025GHz' },
  { type: 'warning',  text: '[WARN] Kessler density index elevated in 600-800km shell · Index: 7.2/10' },
  { type: 'info',     text: '[INFO] RISAT-2B SAR imaging pass complete · Data downlinked to NTRO' },
  { type: 'critical', text: '[ALERT] Unknown RSO tracked at 430km · No catalog match · Classification: UNK' },
  { type: 'info',     text: '[INFO] TLE refresh complete · CelesTrak sync: 27,452 objects updated' },
  { type: 'warning',  text: '[WARN] Geomagnetic storm forecast · Kp-index: 6.2 · Drag effects expected' },
  { type: 'info',     text: '[INFO] GSAT-30 C-band transponder health: NOMINAL · EIRP: 48.5 dBW' },
  { type: 'critical', text: '[ALERT] RF interference detected on S-band · Origin: 78.3°E, 3.2°N · Investigating' },
];

let alertQueue = [...ALERT_POOL];

function startAlertFeed() {
  const feed = document.getElementById('alert-feed');
  if (!feed) return;

  // Seed with a few alerts
  for (let i = 0; i < 4; i++) addAlert(feed);

  setInterval(() => addAlert(feed), 3500 + Math.random() * 2000);
}

function addAlert(feed) {
  if (alertQueue.length === 0) alertQueue = [...ALERT_POOL];
  const idx = Math.floor(Math.random() * alertQueue.length);
  const alert = alertQueue.splice(idx, 1)[0];

  const now = new Date();
  const time = now.toISOString().slice(11, 19) + ' UTC';

  const div = document.createElement('div');
  div.className = `alert-item ${alert.type}`;
  div.innerHTML = `
    <span class="alert-time">${time}</span>
    ${alert.text}
  `;

  feed.insertBefore(div, feed.firstChild);

  // Keep max 12 items
  while (feed.children.length > 12) {
    feed.removeChild(feed.lastChild);
  }
}
