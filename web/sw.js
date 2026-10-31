// Service worker for the patient app.
//
// SAFETY RULE: this site shares an origin (eisenhourlabs.github.io) with other apps.
// The Cache Storage API is per-ORIGIN, so this worker must only ever create, read or delete
// caches whose name starts with PREFIX. tests/sw.test.js enforces this.

const PREFIX = 'glp1proto-';
const CACHE = `${PREFIX}v3`;
const ASSETS = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './shared/ui.css',
  './shared/dom.js',
  './shared/supa.js',
  './shared/shell.js',
  './shared/ui.js',
  './patient/main.js',
  './patient/api.js',
  './patient/copy.js',
  './patient/onboarding.js',
  './patient/onboarding_profile.js',
  './patient/paused.js',
  './patient/home.js',
  './patient/today.js',
  './patient/log_api.js',
  './patient/session_copy.js',
  './patient/workout.js',
  './patient/workout_parts.js',
  './engine/util.js',
  './engine/resolve.js',
  './engine/load.js',
  './engine/levels.js',
  './engine/cycle.js',
  './engine/readiness.js',
  './engine/adjust.js',
  './engine/adherence.js',
  './engine/session.js',
  './icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;              // API: never cache
  const inScope = req.url.startsWith(self.registration.scope);
  const isCdn = url.hostname === 'cdn.jsdelivr.net';
  if (!inScope && !isCdn) return;                                // not ours: leave it alone

  // Network-first; fall back to this app's cache when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.open(CACHE).then((c) => c.match(req))
        .then((hit) => hit || (req.mode === 'navigate' ? caches.open(CACHE).then((c) => c.match('./index.html')) : undefined))
        .then((hit) => hit || Response.error())),
  );
});
