// Shared setup for the browser smoke tests: a static server for web/, Playwright, the fake Supabase, and a seed
// built from the private content export. Not part of `npm test` (needs Chromium and the private content).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
export const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'));

const ROOT = new URL('../../web/', import.meta.url).pathname;
const FAKE = readFileSync(new URL('./fake_supabase.js', import.meta.url), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

export function serve(port) {
  return createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
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
        pattern_levels: {}, workout1_check: {}, dumbbells_available: [], floor_ok: false, ...patient }],
      app_settings: Object.entries(content.settings || {}).map(([key, value]) => ({ key, value })),
      content_exercises: v(content.library), content_templates: v(content.templates), content_slots: v(content.slots),
      content_setups: v(content.setups), content_equipment: v(content.equipment), content_warmups: v(content.warmups || []),
    },
  };
}

/** A fresh browser context with the fake backend; returns { ctx, page, btn, snap, errors }. */
export async function openApp(browser, name, seedData, { shots, time } = {}) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { window.__FAKE_SEED__ = s; }, seedData);
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  const page = await ctx.newPage();
  if (time) await page.clock.setFixedTime(new Date(time));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  const btn = (n, o = {}) => page.getByRole('button', { name: n, ...o });
  const snap = async (n) => shots && page.screenshot({ path: `${shots}/${name}-${n}.png`, fullPage: true });
  return { ctx, page, btn, snap, errors };
}

export const fakeDb = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('fake-db')));

export async function signIn(page) {
  await page.goto('http://localhost:8766/');
  await page.fill('#email', 'dana@demo'); await page.fill('#password', 'pw123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
}
