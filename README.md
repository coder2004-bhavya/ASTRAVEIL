# ASTRAVEIL — Space & Defence Situational Awareness Platform

> **Unified Space-Defence Situational Awareness Platform**  
> DRDO Internship Showcase | Level 4 Project

[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-00f5ff?style=flat-square)](https://astraveil.vercel.app)
![Tech](https://img.shields.io/badge/Three.js-r128-00f5ff?style=flat-square)
![Tech](https://img.shields.io/badge/Globe.gl-2.26-ffd700?style=flat-square)
![Tech](https://img.shields.io/badge/satellite.js-4.1-ff6b35?style=flat-square)
![Data](https://img.shields.io/badge/Data-CelesTrak_TLE-00ff9d?style=flat-square)

---

## What is ASTRAVEIL?

ASTRAVEIL (*Astro + Surveillance + Veil*) is a proof-of-concept **Space & Defence Situational Awareness** web platform. It demonstrates real-time 3D orbital mechanics, satellite tracking, space debris collision prediction, and ballistic trajectory simulation — all inside a mission-control-grade HUD interface.

Directly relevant to DRDO programs:
- **ISSA** — Integrated Space Situational Awareness
- **MRSAM** — Medium-Range Surface-to-Air Missile system
- **ASAT** — Anti-Satellite capability demonstration
- **IRNSS** — Indian Regional Navigation Satellite System tracking

---

## Live Features

| Module | Description | Tech |
|--------|-------------|------|
| **Hero Globe** | Animated 3D Earth with atmosphere, grid lines, debris ring, satellite orbit | Three.js |
| **Orbital Tracker** | Real-time satellite positions from CelesTrak TLE data | Globe.gl + satellite.js |
| **Debris Field** | 3D particle simulation of LEO/MEO/GEO debris shells with collision risk index | Three.js Points |
| **Trajectory Sim** | Ballistic / Hypersonic / ASAT trajectory plotter with MRSAM intercept window | Three.js |
| **Mission HUD** | Full mission control dashboard — radar sweep, telemetry charts, alert feed, subsystem status | Chart.js + Canvas |

---

## Tech Stack

```
Frontend:    HTML5 + Vanilla CSS + JavaScript ES6 Modules
Build:       Vite 5
3D Engine:   Three.js r128 (CDN)
Globe:       Globe.gl 2.26 (CDN)
Satellites:  satellite.js 4.1 — TLE SGP4 propagation (CDN)
Charts:      Chart.js 4.4 (CDN)
Animation:   GSAP 3.12 (CDN)
Data:        CelesTrak TLE API (free, no API key)
Fonts:       Orbitron + Share Tech Mono + Exo 2 (Google Fonts)
```

**No paid APIs. No backend. No authentication. Pure client-side.**

---

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm 9+

### Install & Run

```bash
# Clone or unzip the project
cd astraveil

# Install Vite (only dev dependency)
npm install

# Start dev server — opens browser automatically
npm run dev
# → http://localhost:5173

# Build for production
npm run build

# Preview production build
npm run preview
```

### Deploy to Vercel (free, shareable link)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from project root
vercel --prod
# → https://astraveil-yourname.vercel.app
```

---

## Project Structure

```
astraveil/
├── index.html              ← Single-page app shell, all CDN imports
├── vite.config.js          ← Build config
├── package.json
├── README.md
└── src/
    ├── main.js             ← Entry: boot sequence, loading, nav, clocks
    ├── style.css           ← Full design system (CSS custom properties)
    ├── modules/
    │   ├── hero.js         ← Three.js Earth + starfield + atmosphere
    │   ├── orbital.js      ← Globe.gl + CelesTrak TLE live satellite tracker
    │   ├── debris.js       ← Three.js debris particle field + conjunction list
    │   ├── trajectory.js   ← Ballistic/hypersonic/ASAT trajectory simulator
    │   └── mission.js      ← Radar, Chart.js telemetry, alert feed, status grid
    └── utils/
        └── tle.js          ← TLE fetch, parse, propagate, classify satellites
```

---

## Data Sources

**CelesTrak** (celestrak.org) — Public TLE data, updated every 8 hours. Used by NASA, ESA, and commercial operators for collision avoidance. No API key required.

Endpoints used:
- `visual.txt` — Top 100 brightest objects (ISS, Hubble, etc.)
- `stations.txt` — Space stations
- `irnss.txt` — IRNSS constellation
- `gps-ops.txt` — GPS satellites

If CORS blocks live fetch (network dependent), the app falls back to 10 curated demo satellites including ISS, IRNSS-1A, GSAT-30, CARTOSAT-3, and RISAT-2B.

---

## DRDO Relevance

### Integrated Space Situational Awareness (ISSA)
The orbital tracker and debris modules directly simulate what DRDO's ISSA program aims to achieve — a unified picture of the near-Earth space environment including active satellites and debris conjunction risks.

### MRSAM Intercept Modeling
The trajectory simulator models the intercept geometry used by MRSAM (Medium-Range Surface-to-Air Missile). The intercept window calculation uses simplified CARA (Conjunction Assessment Risk Analysis) methodology.

### ASAT Capability
The ASAT trajectory mode simulates a direct-ascent anti-satellite profile, relevant to India's ASAT test (Mission Shakti, 2019) and future space denial capability architecture.

### IRNSS Tracking
IRNSS satellites are classified and highlighted in the orbital tracker. Their GEO/GSO orbital mechanics are correctly propagated using TLE data.

---

## Verification Checklist

- [x] Globe.gl loads with real Earth texture
- [x] CelesTrak TLE fetch with automatic fallback to demo data
- [x] satellite.js SGP4 propagation produces valid lat/lng/alt
- [x] Three.js scenes render without WebGL errors
- [x] Chart.js telemetry updates in real-time
- [x] Radar sweep canvas animation smooth at 60fps
- [x] All modals open/close correctly
- [x] Loading screen sequence completes
- [x] Vite build passes (0 errors, 0 warnings)
- [x] Responsive layout on mobile (3D replaced with 2D fallback)

---

## Screenshots

*Run locally and take screenshots for your portfolio submission.*

Key screens to capture:
1. Hero — rotating Earth at night
2. Orbital Tracker — Globe with satellite dots and list panel
3. Debris Field — red/orange particle cloud around Earth
4. Trajectory Sim — missile arc with intercept vector
5. Mission HUD — full dashboard with live radar and charts

---

## Author

Built as a **Level 4 Internship Showcase Project** for DRDO recruitment evaluation.  
Demonstrates: 3D WebGL programming, real orbital mechanics, space systems domain knowledge, and defence-relevant UI/UX design.

---

*SIMULATED DATA — FOR EDUCATIONAL AND DEMONSTRATION PURPOSES ONLY*  
*All threat scenarios, trajectories, and intelligence feeds are synthetic.*
