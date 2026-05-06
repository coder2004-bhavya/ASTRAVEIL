// ═══════════════════════════════════════════════════════
// ASTRAVEIL — Main Entry Point
// Orchestrates all modules: loading, hero, orbital, debris,
// trajectory, mission HUD, modals, nav
// ═══════════════════════════════════════════════════════

import { initHero } from './modules/hero.js';
import { initOrbital } from './modules/orbital.js';
import { initDebris } from './modules/debris.js';
import { initTrajectory } from './modules/trajectory.js';
import { initMission } from './modules/mission.js';
import { initWebSocketClient, loadBackendData, api } from './utils/apiClient.js';

// ── Global state ──
window.ASTRAVEIL = {
  satellites: [],
  selectedSat: null,
};

// ── Loading sequence ──
const LOADING_STEPS = [
  'LOADING ORBITAL DATABASE...',
  'FETCHING TLE CATALOG...',
  'INITIALIZING 3D RENDERER...',
  'CALIBRATING DEBRIS TRACKER...',
  'LOADING MISSION SYSTEMS...',
  'ASTRAVEIL ONLINE',
];

async function runLoadingSequence() {
  const fill = document.getElementById('loading-fill');
  const status = document.getElementById('loading-status');

  for (let i = 0; i < LOADING_STEPS.length; i++) {
    status.textContent = LOADING_STEPS[i];
    fill.style.width = `${((i + 1) / LOADING_STEPS.length) * 100}%`;
    await sleep(400 + Math.random() * 300);
  }

  await sleep(300);
  document.getElementById('loading-screen').classList.add('hidden');
}

// ── Clock ──
function startClocks() {
  const navClock = document.getElementById('nav-clock');
  const missionClock = document.getElementById('mission-clock');
  const start = Date.now();

  setInterval(() => {
    const now = new Date();
    const utc = now.toISOString().slice(11, 19);
    navClock.textContent = `${utc} UTC`;

    const elapsed = Math.floor((Date.now() - start) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    if (missionClock) missionClock.textContent = `T+ ${h}:${m}:${s}`;
  }, 1000);
}

// ── Stat counters ──
function animateCounters() {
  document.querySelectorAll('.stat-value[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target);
    const dur = 2000;
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / dur, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ── Scroll reveal ──
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '-50px' });

  document.querySelectorAll('.reveal-up').forEach(el => observer.observe(el));
}

// ── Active nav link on scroll ──
function initNavHighlight() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(s => observer.observe(s));
}

// ── Velocity display ──
function initVelocitySlider() {
  const range = document.getElementById('velocity-range');
  const display = document.getElementById('vel-display');
  if (!range) return;
  range.addEventListener('input', () => {
    display.textContent = parseInt(range.value).toLocaleString();
  });
}

// ── Utilities (global) ──
window.scrollToSection = (id) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

window.openModal = (id) => {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById(id).classList.add('open');
};

window.closeModal = () => {
  document.getElementById('modal-overlay').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
};

window.sleep = (ms) => new Promise(r => setTimeout(r, ms));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── BOOT ──
async function boot() {
  startClocks();
  await runLoadingSequence();

  // Init all modules
  initHero();
  animateCounters();
  initScrollReveal();
  initNavHighlight();
  initVelocitySlider();

  // Connect WebSocket + load backend data
  initWebSocketClient();
  setTimeout(() => loadBackendData(), 2000);

  // Defer heavier modules
  setTimeout(() => initOrbital(), 500);
  setTimeout(() => initDebris(), 800);
  setTimeout(() => initTrajectory(), 1000);
  setTimeout(() => initMission(), 1200);
}

document.addEventListener('DOMContentLoaded', boot);
