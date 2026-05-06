// ═══════════════════════════════════════════════════════
// TRAJECTORY MODULE — Ballistic / Hypersonic / ASAT Simulator
// ═══════════════════════════════════════════════════════

let trajScene, trajCamera, trajRenderer, trajClock;
let missileMesh, interceptMesh;
let animating = false;
let trajT = 0;
let currentPath = [];
let interceptPath = [];

export function initTrajectory() {
  const canvas = document.getElementById('trajectory-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // ── Scene ──
  trajScene = new THREE.Scene();
  trajCamera = new THREE.PerspectiveCamera(55, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
  trajCamera.position.set(0, 3, 7);
  trajCamera.lookAt(0, 1, 0);

  trajRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  trajRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  trajRenderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  trajRenderer.setClearColor(0x020818, 1);

  trajClock = new THREE.Clock();

  // ── Lights ──
  trajScene.add(new THREE.AmbientLight(0x112244, 2));
  const sun = new THREE.DirectionalLight(0x88aaff, 4);
  sun.position.set(5, 8, 5);
  trajScene.add(sun);

  // ── Earth surface (low-poly flat-ish) ──
  buildEarthScene();

  // ── Stars ──
  addStarfield();

  // ── Missile dot ──
  const missileGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const missileMat = new THREE.MeshBasicMaterial({ color: 0xff2d55, blending: THREE.AdditiveBlending });
  missileMesh = new THREE.Mesh(missileGeo, missileMat);
  missileMesh.visible = false;
  trajScene.add(missileMesh);

  // Intercept dot
  const intGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const intMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff, blending: THREE.AdditiveBlending });
  interceptMesh = new THREE.Mesh(intGeo, intMat);
  interceptMesh.visible = false;
  trajScene.add(interceptMesh);

  // ── Resize ──
  const ro = new ResizeObserver(() => {
    const w = canvas.offsetWidth, h = canvas.offsetHeight;
    trajCamera.aspect = w / h;
    trajCamera.updateProjectionMatrix();
    trajRenderer.setSize(w, h);
  });
  ro.observe(canvas);

  // ── Initial idle animation ──
  animateScene();
}

function buildEarthScene() {
  // Curved Earth surface
  const earthGeo = new THREE.SphereGeometry(20, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 6);
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0x0a2040,
    emissive: 0x000811,
    shininess: 10,
    side: THREE.FrontSide,
  });
  const loader = new THREE.TextureLoader();
  loader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    t => { earthMat.map = t; earthMat.needsUpdate = true; }, undefined, () => {});

  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.position.y = -20;
  trajScene.add(earth);

  // Grid overlay on surface
  const gridMat = new THREE.LineBasicMaterial({ color: 0x0d2444, transparent: true, opacity: 0.4 });
  for (let i = -4; i <= 4; i++) {
    addGridLine([new THREE.Vector3(i * 2, 0, -10), new THREE.Vector3(i * 2, 0, 10)], gridMat);
    addGridLine([new THREE.Vector3(-8, 0, i * 2), new THREE.Vector3(8, 0, i * 2)], gridMat);
  }

  // Launch site marker — Sriharikota
  addSiteMarker(-3, 0, 1, '#00f5ff', 'SDSC SHAR');
  // Target marker
  addSiteMarker(3.5, 0, -1.5, '#ff2d55', 'TARGET');
}

function addGridLine(points, mat) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  trajScene.add(new THREE.Line(geo, mat));
}

function addSiteMarker(x, y, z, color, label) {
  const geo = new THREE.CylinderGeometry(0, 0.08, 0.3, 4);
  const mat = new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending });
  const marker = new THREE.Mesh(geo, mat);
  marker.position.set(x, y + 0.15, z);
  trajScene.add(marker);

  // Pulse ring
  const ringGeo = new THREE.TorusGeometry(0.2, 0.02, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.02, z);
  ring.userData.pulse = true;
  trajScene.add(ring);
}

function addStarfield() {
  const pos = new Float32Array(2000 * 3);
  for (let i = 0; i < 2000; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 400;
    pos[i*3+1] = Math.random() * 200 + 5;
    pos[i*3+2] = (Math.random() - 0.5) * 400;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  trajScene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.3, color: 0x7ea8cc, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));
}

// ── Build parabolic path points ──
function buildBallistic(launch, target, apogeeH, steps = 120) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = launch.x + (target.x - launch.x) * t;
    const z = launch.z + (target.z - launch.z) * t;
    const y = 4 * apogeeH * t * (1 - t); // parabola
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

function buildHypersonic(launch, target, steps = 120) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = launch.x + (target.x - launch.x) * t;
    const z = launch.z + (target.z - launch.z) * t;
    // Flatter, faster trajectory with terminal dive
    const y = t < 0.7
      ? 1.5 * Math.sin(t / 0.7 * Math.PI) * 0.8
      : 1.5 * Math.sin(Math.PI) * 0.8 - (t - 0.7) / 0.3 * 0.5;
    points.push(new THREE.Vector3(x, Math.max(0, y), z));
  }
  return points;
}

function buildASAT(launch, steps = 120) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = launch.x + t * 0.5;
    const z = launch.z - t * 0.2;
    const y = t * 8; // straight up to orbit
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

// ── Draw trajectory line ──
function drawPath(points, color, opacity = 0.8) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending });
  const line = new THREE.Line(geo, mat);
  line.userData.isTrajectory = true;
  trajScene.add(line);
  return line;
}

// ── Remove old trajectories ──
function clearTrajectories() {
  const toRemove = [];
  trajScene.traverse(obj => { if (obj.userData.isTrajectory) toRemove.push(obj); });
  toRemove.forEach(obj => trajScene.remove(obj));
}

// ── FIRE MISSILE (called from HTML) ──
window.fireMissile = function () {
  if (animating) return;
  clearTrajectories();

  const launchSite = document.getElementById('launch-site')?.value || 'sriharikota';
  const targetSite = document.getElementById('target-site')?.value || 'leo';
  const velocity   = parseInt(document.getElementById('velocity-range')?.value || 3200);
  const trajType   = document.querySelector('input[name="traj"]:checked')?.value || 'ballistic';

  // Launch/target positions in scene space
  const SITES = {
    sriharikota: { x: -3, z: 1 },
    chandipur:   { x: -2, z: 2 },
    pokhran:     { x: -2.5, z: -0.5 },
    custom:      { x: -3.5, z: 0.5 },
  };
  const launch = SITES[launchSite] || SITES.sriharikota;

  const TARGETS = {
    leo:      { x: 3.5, z: -1.5, alt: 400 },
    meo:      { x: 4, z: -2, alt: 2000 },
    geo:      { x: 4.5, z: -2.5, alt: 36000 },
    ballistic:{ x: 3.5, z: -1.5, alt: 500 },
  };
  const target = TARGETS[targetSite] || TARGETS.leo;

  // Apogee height in scene units (scale down)
  const apogeeScene = trajType === 'asat' ? 8 : Math.min(4, target.alt / 2000 + 1.5);

  if (trajType === 'ballistic') {
    currentPath = buildBallistic({ ...launch, y: 0 }, { ...target, y: 0 }, apogeeScene);
  } else if (trajType === 'hypersonic') {
    currentPath = buildHypersonic({ ...launch, y: 0 }, { ...target, y: 0 });
  } else {
    currentPath = buildASAT({ ...launch, y: 0 });
  }

  // Draw ghost path
  drawPath(currentPath, 0x333355, 0.3);

  // Intercept path (MRSAM) — launches from midpoint
  const interceptT = 0.45;
  const interceptStart = currentPath[Math.floor(interceptT * currentPath.length)];
  const interLaunch = { x: -1, z: 0 };
  interceptPath = buildBallistic(
    { x: interLaunch.x, y: 0, z: interLaunch.z },
    { x: interceptStart.x, y: 0, z: interceptStart.z },
    interceptStart.y * 0.8
  );
  drawPath(interceptPath, 0x00f5ff, 0.2);

  // Compute results
  const flightTime = currentPath.length * (trajType === 'hypersonic' ? 0.08 : 0.12);
  const apogeeKm   = trajType === 'asat' ? target.alt : Math.round(target.alt * (apogeeScene / 4));
  const maxVelKms  = (velocity / 1000).toFixed(2);
  const interceptT_s = Math.floor(flightTime * interceptT);

  document.getElementById('apogee-val').textContent    = `${apogeeKm.toLocaleString()} km`;
  document.getElementById('flighttime-val').textContent = `${flightTime.toFixed(0)}s (~${(flightTime/60).toFixed(1)} min)`;
  document.getElementById('maxvel-val').textContent    = `${maxVelKms} km/s (Mach ${Math.round(velocity / 340)})`;
  document.getElementById('intercept-val').textContent = trajType !== 'asat'
    ? `T+${interceptT_s}s @ ${Math.round(apogeeKm * 0.3)}km`
    : 'BEYOND MRSAM CEILING';

  // Animate
  trajT = 0;
  animating = true;
  missileMesh.visible = true;
  interceptMesh.visible = false;

  // Flash launch btn
  const btn = document.getElementById('launch-btn');
  if (btn) {
    btn.textContent = '⬛ SIMULATING...';
    btn.style.opacity = '0.7';
    setTimeout(() => {
      btn.textContent = '▶ SIMULATE TRAJECTORY';
      btn.style.opacity = '1';
    }, flightTime * 1000);
  }
};

// ── Main animation loop ──
function animateScene() {
  const elapsed = trajClock.getElapsedTime();

  // Pulse rings
  trajScene.traverse(obj => {
    if (obj.userData.pulse) {
      const s = 1 + 0.4 * Math.sin(elapsed * 2);
      obj.scale.setScalar(s);
      if (obj.material) obj.material.opacity = 0.3 + 0.3 * Math.sin(elapsed * 2);
    }
  });

  // Animate missile
  if (animating && currentPath.length > 0) {
    trajT += 0.006;
    if (trajT >= 1) {
      trajT = 1;
      animating = false;
      missileMesh.visible = false;
      // Draw final path line
      drawPath(currentPath, 0xff2d55, 0.7);
      drawPath(interceptPath, 0x00f5ff, 0.6);
    }

    const idx = Math.min(Math.floor(trajT * currentPath.length), currentPath.length - 1);
    const pos = currentPath[idx];
    missileMesh.position.copy(pos);

    // Missile trail
    if (idx > 0 && idx % 8 === 0) {
      const trailGeo = new THREE.SphereGeometry(0.03, 4, 4);
      const trailMat = new THREE.MeshBasicMaterial({
        color: 0xff6b35, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending
      });
      const trail = new THREE.Mesh(trailGeo, trailMat);
      trail.position.copy(pos);
      trail.userData.isTrajectory = true;
      trajScene.add(trail);
    }

    // Launch intercept at ~45% flight
    if (trajT >= 0.45 && trajT < 0.47 && interceptPath.length > 0) {
      interceptMesh.visible = true;
    }
    if (interceptMesh.visible && interceptPath.length > 0) {
      const iT = Math.min((trajT - 0.45) / 0.45, 1);
      const iIdx = Math.min(Math.floor(iT * interceptPath.length), interceptPath.length - 1);
      interceptMesh.position.copy(interceptPath[iIdx]);
    }
  }

  // Idle camera bob
  if (!animating) {
    trajCamera.position.x = 3 * Math.sin(elapsed * 0.1);
    trajCamera.position.y = 3 + Math.sin(elapsed * 0.15) * 0.3;
    trajCamera.position.z = 7 + Math.cos(elapsed * 0.1) * 1;
    trajCamera.lookAt(0, 1, 0);
  }

  trajRenderer.render(trajScene, trajCamera);
  requestAnimationFrame(animateScene);
}

// ── Local apogee fallback (used when backend unavailable) ──
function localApogee(targetSite, trajType) {
  const ALTS = { leo: 400, meo: 2000, geo: 36000, ballistic: 500 };
  return ALTS[targetSite] || 400;
}
