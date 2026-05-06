// ═══════════════════════════════════════════════════════
// DEBRIS MODULE — Three.js Particle Debris Field + Collision Risk Engine
// ═══════════════════════════════════════════════════════

export function initDebris() {
  const canvas = document.getElementById('debris-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // ── Scene ──
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, canvas.offsetWidth / canvas.offsetHeight, 0.1, 500);
  camera.position.set(0, 0, 4);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  renderer.setClearColor(0x020818, 1);

  // ── Earth ──
  const earthGeo = new THREE.SphereGeometry(1, 48, 48);
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0x0a2a5a,
    emissive: 0x000511,
    shininess: 20,
  });
  const loader = new THREE.TextureLoader();
  loader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    t => { earthMat.map = t; earthMat.needsUpdate = true; }, undefined, () => {});

  scene.add(new THREE.Mesh(earthGeo, earthMat));

  // Atmosphere
  const atmMat = new THREE.MeshPhongMaterial({
    color: 0x0044aa, transparent: true, opacity: 0.06,
    side: THREE.FrontSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 32, 32), atmMat));

  // ── Lights ──
  scene.add(new THREE.AmbientLight(0x223355, 2));
  const sun = new THREE.DirectionalLight(0x88aaff, 4);
  sun.position.set(5, 3, 5);
  scene.add(sun);

  // ── Debris shell definitions ──
  const shells = [
    { name: 'LEO',  rMin: 1.08, rMax: 1.45, count: 800, risk: 'high' },
    { name: 'MEO',  rMin: 1.45, rMax: 2.20, count: 400, risk: 'medium' },
    { name: 'GEO',  rMin: 2.20, rMax: 2.60, count: 200, risk: 'low' },
  ];

  const RISK_COLORS = {
    high: [1.0, 0.17, 0.33],   // red
    medium: [1.0, 0.42, 0.21], // orange
    low: [0.0, 0.96, 1.0],     // cyan
  };

  const allDebrisObjects = [];

  shells.forEach(shell => {
    const positions = new Float32Array(shell.count * 3);
    const colors = new Float32Array(shell.count * 3);
    const velocities = [];
    const col = RISK_COLORS[shell.risk];

    for (let i = 0; i < shell.count; i++) {
      const r = shell.rMin + Math.random() * (shell.rMax - shell.rMin);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Slight color variation
      colors[i * 3]     = col[0] * (0.8 + Math.random() * 0.2);
      colors[i * 3 + 1] = col[1] * (0.8 + Math.random() * 0.2);
      colors[i * 3 + 2] = col[2] * (0.8 + Math.random() * 0.2);

      velocities.push(0.001 + Math.random() * 0.003);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: shell.risk === 'high' ? 0.015 : shell.risk === 'medium' ? 0.012 : 0.008,
      vertexColors: true,
      transparent: true,
      opacity: shell.risk === 'high' ? 0.9 : 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);
    allDebrisObjects.push({ points, velocities, shell });
  });

  // ── Orbit rings to show shell boundaries ──
  const ringMat = new THREE.LineBasicMaterial({
    color: 0x0d2444, transparent: true, opacity: 0.3,
  });

  [1.45, 2.20, 2.60].forEach(r => {
    const pts = [];
    for (let a = 0; a <= 360; a += 3) {
      const rad = a * Math.PI / 180;
      pts.push(new THREE.Vector3(r * Math.cos(rad), 0, r * Math.sin(rad)));
    }
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      ringMat
    ));
  });

  // ── Starfield ──
  const starPos = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) {
    const r = 100 + Math.random() * 200;
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(2 * Math.random() - 1);
    starPos[i*3]   = r * Math.sin(p) * Math.cos(t);
    starPos[i*3+1] = r * Math.sin(p) * Math.sin(t);
    starPos[i*3+2] = r * Math.cos(p);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 0.4, color: 0x7ea8cc, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // ── Auto-rotate camera ──
  let autoAngle = 0;

  // ── Resize ──
  const resizeObserver = new ResizeObserver(() => {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(canvas);

  // ── Animate ──
  const clock = new THREE.Clock();

  function animate() {
    const elapsed = clock.getElapsedTime();

    // Slowly rotate debris shells
    allDebrisObjects.forEach(({ points, shell }, idx) => {
      const speed = shell.risk === 'high' ? 0.015 : shell.risk === 'medium' ? 0.008 : 0.004;
      points.rotation.y = elapsed * speed * (idx % 2 === 0 ? 1 : -0.7);
      points.rotation.x = elapsed * speed * 0.3;
    });

    // Camera orbits
    autoAngle += 0.003;
    camera.position.x = 4 * Math.sin(autoAngle);
    camera.position.z = 4 * Math.cos(autoAngle);
    camera.position.y = Math.sin(autoAngle * 0.5) * 1.5;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();

  // ── Populate conjunction list ──
  populateConjunctions();

  // ── Risk gauge ──
  drawRiskGauge(4.7);
}

// ── Draw semi-circular risk gauge ──
function drawRiskGauge(value) {
  const canvas = document.getElementById('risk-gauge-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h - 10;
  const r = 80;

  ctx.clearRect(0, 0, w, h);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.strokeStyle = '#0d2444';
  ctx.lineWidth = 12;
  ctx.stroke();

  // Value arc
  const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0,   '#00f5ff');
  grad.addColorStop(0.5, '#ff6b35');
  grad.addColorStop(1,   '#ff2d55');

  ctx.beginPath();
  const endAngle = Math.PI + (value / 10) * Math.PI;
  ctx.arc(cx, cy, r, Math.PI, endAngle);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Tick marks
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    const inner = r - 16;
    const outer = r - 6;
    ctx.beginPath();
    ctx.moveTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a));
    ctx.lineTo(cx + outer * Math.cos(a), cy + outer * Math.sin(a));
    ctx.strokeStyle = i === Math.round(value) ? '#00f5ff' : '#1a3a6a';
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.stroke();
  }
}

// ── Populate conjunction data ──
function populateConjunctions() {
  const list = document.getElementById('conjunction-list');
  if (!list) return;

  const conjunctions = [
    { obj1: 'COSMOS 2251 DEB', obj2: 'IRIDIUM 33 DEB', miss: '1.2 km', prob: '1:312', risk: 'critical', time: 'T+02:14:33' },
    { obj1: 'SL-8 R/B', obj2: 'STARLINK-1847', miss: '3.7 km', prob: '1:1240', risk: 'high', time: 'T+05:42:17' },
    { obj1: 'FENGYUN 1C DEB', obj2: 'RESOURCESAT-2', miss: '4.8 km', prob: '1:3100', risk: 'high', time: 'T+09:11:05' },
  ];

  list.innerHTML = '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-bottom:8px;letter-spacing:.2em">CRITICAL CONJUNCTIONS</div>';

  conjunctions.forEach(c => {
    const div = document.createElement('div');
    div.className = `conjunction-item ${c.risk}`;
    div.innerHTML = `
      <div class="conj-header">
        <span>${c.obj1}</span>
        <span class="conj-risk ${c.risk === 'high' ? 'high' : ''}">${c.prob}</span>
      </div>
      <div class="conj-detail">${c.obj2} · MISS: ${c.miss} · ${c.time}</div>
    `;
    list.appendChild(div);
  });

  // Also populate modal
  const modalConj = document.getElementById('modal-conjunctions');
  if (modalConj) {
    modalConj.innerHTML = '';
    conjunctions.forEach(c => {
      const div = document.createElement('div');
      div.className = `conjunction-item ${c.risk}`;
      div.style.marginBottom = '10px';
      div.innerHTML = `
        <div class="conj-header">
          <span>${c.obj1} × ${c.obj2}</span>
          <span class="conj-risk ${c.risk === 'high' ? 'high' : ''}">P(collision): ${c.prob}</span>
        </div>
        <div class="conj-detail">Miss Distance: ${c.miss} · Time of Closest Approach: ${c.time} · Relative Velocity: ~8.4 km/s</div>
      `;
      modalConj.appendChild(div);
    });
  }
}
