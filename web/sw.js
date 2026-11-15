// Service worker for the app (patient, clinic and admin pages share it).
//
// SAFETY RULE: this site shares an origin (eisenhourlabs.github.io) with other apps.
// The Cache Storage API is per-ORIGIN, so this worker must only ever create, read or delete
// caches whose name starts with PREFIX. tests/static.test.js enforces this.
//
// Safe updates (backlog C5): every file is served from this version's cache, so code never changes under an open
// page. A new deploy (a new web/version.js) installs alongside and WAITS: the home screen shows "Update ready" and
// applies it when she taps, otherwise it takes over the next time the app is fully closed and reopened. Never
// skipWaiting on install: that is what could swap code in the middle of a workout.

importScripts('./version.js');
const PREFIX = 'glp1proto-';
const CACHE = `${PREFIX}${self.GLP1PROTO_VERSION}`;
// Every file under web/ except this one, plus the folder pages (tests/static.test.js checks the list).
const ASSETS = [
  './',
  './admin/',
  './clinic/',
  './config.js',
  './index.html',
  './join.html',
  './join.js',
  './manifest.webmanifest',
  './reset.html',
  './version.js',
  './admin/ai.js',
  './admin/api.js',
  './admin/clinics.js',
  './admin/flags.js',
  './admin/index.html',
  './admin/kit.js',
  './admin/main.js',
  './admin/patient.js',
  './admin/patients.js',
  './admin/settings.js',
  './clinic/index.html',
  './clinic/main.js',
  './clinic/report.js',
  './engine/README.md',
  './engine/adherence.js',
  './engine/adjust.js',
  './engine/checkin.js',
  './engine/cycle.js',
  './engine/error_report.js',
  './engine/home_state.js',
  './engine/levels.js',
  './engine/lighter.js',
  './engine/load.js',
  './engine/offers.js',
  './engine/progress.js',
  './engine/readiness.js',
  './engine/reflection.js',
  './engine/report.js',
  './engine/resolve.js',
  './engine/review.js',
  './engine/review_validate.js',
  './engine/session.js',
  './engine/util.js',
  './engine/week_streak.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './patient/api.js',
  './patient/checkin.js',
  './patient/copy.js',
  './patient/extras.js',
  './patient/home.js',
  './patient/log_api.js',
  './patient/log_writes.js',
  './patient/main.js',
  './patient/offers_ui.js',
  './patient/onboarding.js',
  './patient/onboarding_profile.js',
  './patient/outbox.js',
  './patient/overlay.js',
  './patient/paused.js',
  './patient/progress.js',
  './patient/review.js',
  './patient/session_copy.js',
  './patient/sync_ui.js',
  './patient/today.js',
  './patient/workout.js',
  './patient/workout_parts.js',
  './shared/a11y.js',
  './shared/dom.js',
  './shared/enroll_rules.js',
  './shared/errors.js',
  './shared/ics.js',
  './shared/idb.js',
  './shared/offline.js',
  './shared/shell.js',
  './shared/supa.js',
  './shared/ui.css',
  './shared/ui.js',
  './shared/update.js',
  './vendor/qrcode.js',
  './vendor/supabase-js.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so a new version never gets cached with old files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks for the waiting version to take over only when she taps "Update now" on the home screen.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;              // API: never cache
  if (!req.url.startsWith(self.registration.scope)) return;      // not ours: leave it alone

  // This version's cache first (pages ignore the query string, e.g. join.html?code=…); the network only for
  // anything not cached yet; index.html as the offline fallback for a page.
  const nav = req.mode === 'navigate';
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: nav }).then((hit) => hit || fetch(req)
      .then((res) => {
        if (res && res.ok && !nav) c.put(req, res.clone());
        return res;
      })
      .catch(() => Promise.resolve(nav ? c.match('./index.html') : undefined).then((x) => x || Response.error())))),
  );
});
