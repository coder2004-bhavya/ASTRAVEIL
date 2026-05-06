// ═══════════════════════════════════════════════════════
// HERO MODULE — Three.js Rotating Earth + Atmosphere + Starfield
// ═══════════════════════════════════════════════════════

export function initHero() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // ── Scene setup ──
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );
  camera.position.set(0, 0, 2.8);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  // ── Lights ──
  const ambientLight = new THREE.AmbientLight(0x112244, 1.5);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0x88ccff, 3);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x00f5ff, 0.5);
  rimLight.position.set(-5, -2, -3);
  scene.add(rimLight);

  // ── Texture loader ──
  const loader = new THREE.TextureLoader();

  // ── Earth ──
  const earthGeo = new THREE.SphereGeometry(1, 64, 64);

  // Load earth texture — use THREE's built-in demo texture as fallback
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0x0a2a5a,
    emissive: 0x000511,
    shininess: 25,
    specular: 0x224488,
  });

  const earth = new THREE.Mesh(earthGeo, earthMat);
  scene.add(earth);

  // Try to load real texture
  loader.load(
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
    (texture) => {
      earthMat.map = texture;
      earthMat.needsUpdate = true;
    },
    undefined,
    () => {} // fail silently, use fallback color
  );

  // ── Atmosphere glow (additive blending) ──
  const atmGeo = new THREE.SphereGeometry(1.08, 64, 64);
  const atmMat = new THREE.MeshPhongMaterial({
    color: 0x00f5ff,
    emissive: 0x003355,
    transparent: true,
    opacity: 0.08,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(atmGeo, atmMat);
  scene.add(atmosphere);

  // Outer glow ring
  const glowGeo = new THREE.SphereGeometry(1.15, 32, 32);
  const glowMat = new THREE.MeshPhongMaterial({
    color: 0x0044aa,
    transparent: true,
    opacity: 0.03,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // ── Orbit ring (ISS-like) ──
  const orbitGeo = new THREE.TorusGeometry(1.45, 0.003, 8, 200);
  const orbitMat = new THREE.MeshBasicMaterial({
    color: 0x00f5ff,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
  });
  const orbitRing = new THREE.Mesh(orbitGeo, orbitMat);
  orbitRing.rotation.x = Math.PI / 2 + 0.45;
  orbitRing.rotation.y = 0.3;
  scene.add(orbitRing);

  // ── Satellite dot on orbit ──
  const satGeo = new THREE.SphereGeometry(0.015, 8, 8);
  const satMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    blending: THREE.AdditiveBlending,
  });
  const satDot = new THREE.Mesh(satGeo, satMat);
  scene.add(satDot);
  let satAngle = 0;

  // ── Grid lines (latitude/longitude-like) ──
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x0d2444,
    transparent: true,
    opacity: 0.5,
  });

  // Latitude lines
  for (let lat = -75; lat <= 75; lat += 25) {
    const points = [];
    const phi = (90 - lat) * (Math.PI / 180);
    for (let lng = 0; lng <= 360; lng += 3) {
      const theta = lng * (Math.PI / 180);
      points.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(1.001));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
  }

  // Longitude lines
  for (let lng = 0; lng < 360; lng += 30) {
    const points = [];
    const theta = lng * (Math.PI / 180);
    for (let lat = -90; lat <= 90; lat += 3) {
      const phi = (90 - lat) * (Math.PI / 180);
      points.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(1.001));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
  }

  // ── Starfield ──
  const starCount = 8000;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 400 + Math.random() * 400;

    starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);

    // Vary star colors slightly: white, blue-white, warm
    const t = Math.random();
    if (t < 0.7) { starColors[i*3]=0.8; starColors[i*3+1]=0.9; starColors[i*3+2]=1.0; }
    else if (t < 0.9) { starColors[i*3]=1.0; starColors[i*3+1]=0.95; starColors[i*3+2]=0.8; }
    else { starColors[i*3]=0.7; starColors[i*3+1]=0.8; starColors[i*3+2]=1.0; }
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

  const starMat = new THREE.PointsMaterial({
    size: 0.8,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  scene.add(new THREE.Points(starGeo, starMat));

  // ── Debris ring (small random ring of particles) ──
  const debrisCount = 400;
  const debrisPos = new Float32Array(debrisCount * 3);
  for (let i = 0; i < debrisCount; i++) {
    const r = 1.3 + Math.random() * 0.3;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * 0.3;
    debrisPos[i*3]   = r * Math.cos(theta) * Math.cos(phi);
    debrisPos[i*3+1] = r * Math.sin(phi);
    debrisPos[i*3+2] = r * Math.sin(theta) * Math.cos(phi);
  }
  const debrisGeo = new THREE.BufferGeometry();
  debrisGeo.setAttribute('position', new THREE.BufferAttribute(debrisPos, 3));
  const debrisMat = new THREE.PointsMaterial({
    size: 0.012,
    color: 0xff6b35,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Points(debrisGeo, debrisMat));

  // ── Mouse parallax ──
  let mouseX = 0, mouseY = 0;
  let targetX = 0, targetY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  // ── Resize ──
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Animation loop ──
  const clock = new THREE.Clock();

  function animate() {
    const elapsed = clock.getElapsedTime();

    // Smooth mouse parallax
    targetX += (mouseX * 0.08 - targetX) * 0.04;
    targetY += (mouseY * 0.05 - targetY) * 0.04;

    // Rotate earth
    earth.rotation.y = elapsed * 0.04 + targetX * 0.3;
    earth.rotation.x = targetY * 0.15;
    atmosphere.rotation.copy(earth.rotation);

    // Satellite along orbit
    satAngle += 0.008;
    const r = 1.45;
    const tiltX = Math.PI / 2 + 0.45;
    const tiltY = 0.3;
    // Compute position in orbit plane, then apply tilt
    const lx = r * Math.cos(satAngle);
    const ly = r * Math.sin(satAngle);
    // Simple 2D orbit in tilted plane
    satDot.position.set(
      lx * Math.cos(tiltY) - ly * Math.sin(tiltX) * Math.sin(tiltY),
      ly * Math.cos(tiltX),
      lx * Math.sin(tiltY) + ly * Math.sin(tiltX) * Math.cos(tiltY)
    );

    // Pulse satellite
    const pulse = 1 + 0.3 * Math.sin(elapsed * 4);
    satDot.scale.setScalar(pulse);

    // Subtle camera breathe
    camera.position.z = 2.8 + Math.sin(elapsed * 0.2) * 0.05;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}
