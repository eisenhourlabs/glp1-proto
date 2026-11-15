// Shared setup for the browser smoke tests: a static server for web/, Playwright, the fake Supabase, and a seed
// built from the private content export. Not part of `npm test` (needs Chromium and the private content).
import { createRequire } from 'node:module';
import { readFileSync, appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
export const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'));

const ROOT = new URL('../../web/', import.meta.url).pathname;
const FAKE = readFileSync(new URL('./fake_supabase.js', import.meta.url), 'utf8');
// Accessibility scan (A18): with A11Y_REPORT=<file>, every snap() point and the sign-in page also run axe and append
// serious/critical violations to that file as JSON lines (scripts/a11y_report.mjs summarizes and fails the build).
const A11Y = process.env.A11Y_REPORT;
const AXE_PATH = join(execSync('npm root -g').toString().trim(), 'axe-core', 'axe.min.js');
const AXE = A11Y ? readFileSync(AXE_PATH, 'utf8') : null;
export async function axeScan(page, label) {
  if (!A11Y) return;
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })));
  appendFileSync(A11Y, `${JSON.stringify({ label, path: new URL(page.url()).pathname, violations })}\n`);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

/** Files the server should answer with different content (path → text), e.g. a new web/version.js to simulate a deploy. */
export const OVERRIDES = new Map();

export function serve(port) {
  return createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    if (OVERRIDES.has(p)) { res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'text/plain' }); res.end(OVERRIDES.get(p)); return; }
    // The self-hosted supabase-js is replaced by the fake backend (fake_supabase.js exports the same createClient).
    if (p.endsWith('/vendor/supabase-js.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(FAKE); return; }
    try { res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'text/plain' }); res.end(readFileSync(join(ROOT, p))); }
    catch { res.writeHead(404); res.end(); }
  }).listen(port);
}

export const loadContent = (path) => JSON.parse(readFileSync(path, 'utf8'));

const v = (rows) => rows.map((r) => ({ ...r, version: 1 }));
export function seed(content, patient = {}) {
  return {
    session: null,
    users: [{ id: 'u1', email: 'dana@demo', password: 'pw123456' }],
    tables: {
      clinics: [{ id: 'c1', name: 'Lakeside Weight & Wellness', accent_color: '#7a4fb0', status: 'active' }],
      profiles: [{ id: 'u1', role: 'patient', clinic_id: 'c1', display_name: 'Dana', is_demo: true }],
      patients: [{ id: 'u1', status: 'onboarding', screening_flag: 'none', equipment: [], workarounds: [], restrictions: [], preferred_days: [],
        pattern_levels: {}, workout1_check: {}, dumbbells_available: [], floor_ok: false, timezone: null, ...patient }],
      app_settings: Object.entries(content.settings || {}).map(([key, value]) => ({ key, value })),
      content_exercises: v(content.library), content_templates: v(content.templates), content_slots: v(content.slots),
      content_setups: v(content.setups), content_equipment: v(content.equipment), content_warmups: v(content.warmups || []),
    },
  };
}

/** A fresh browser context with the fake backend; returns { ctx, page, btn, snap, errors }. */
export async function openApp(browser, name, seedData, { shots, time, tz = 'America/Chicago' } = {}) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: tz });
  await ctx.addInitScript((s) => { window.__FAKE_SEED__ = s; }, seedData);
  // A3: the app must not load anything from a CDN; any such request is a test failure.
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => { errors.push(`${name}: CDN request ${r.request().url()}`); return r.abort(); });
  const page = await ctx.newPage();
  if (time) await page.clock.setFixedTime(new Date(time));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  const btn = (n, o = {}) => page.getByRole('button', { name: n, ...o });
  const snap = async (n) => {
    await axeScan(page, `${name}-${n}`);
    if (shots) await page.screenshot({ path: `${shots}/${name}-${n}.png`, fullPage: true });
  };
  return { ctx, page, btn, snap, errors };
}

export const fakeDb = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('fake-db')));

export async function signIn(page, { path = '', email = 'dana@demo' } = {}) {
  await page.goto(`http://localhost:8766/${path}`);
  await page.locator('#email').waitFor();
  await axeScan(page, `sign-in ${path || 'patient'}`);
  await page.fill('#email', email); await page.fill('#password', 'pw123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
}
