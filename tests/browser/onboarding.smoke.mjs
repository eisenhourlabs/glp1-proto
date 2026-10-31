// Browser smoke test: a patient walks onboarding end-to-end against the fake Supabase + real (private) content.
//   node tests/browser/onboarding.smoke.mjs <content.json> [screenshot-dir]
// Not part of `npm test` (needs Playwright + Chromium and the private content export).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
const content = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const shots = process.argv[3];
const ROOT = new URL('../../web/', import.meta.url).pathname;
const FAKE = readFileSync(new URL('./fake_supabase.js', import.meta.url), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  try { res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'text/plain' }); res.end(readFileSync(join(ROOT, p))); }
  catch { res.writeHead(404); res.end(); }
}).listen(8766);

const v = (rows) => rows.map((r) => ({ ...r, version: 1 }));
const seed = (status = 'onboarding') => ({
  session: null,
  users: [{ id: 'u1', email: 'dana@demo', password: 'pw123456' }],
  tables: {
    clinics: [{ id: 'c1', name: 'Lakeside Weight & Wellness', accent_color: '#7a4fb0', status: 'active' }],
    profiles: [{ id: 'u1', role: 'patient', clinic_id: 'c1', display_name: 'Dana', is_demo: true }],
    patients: [{ id: 'u1', status, screening_flag: 'none', equipment: [], workarounds: [], restrictions: [], preferred_days: [],
      pattern_levels: {}, workout1_check: {}, dumbbells_available: [], floor_ok: false }],
    content_exercises: v(content.library), content_templates: v(content.templates), content_slots: v(content.slots),
    content_setups: v(content.setups), content_equipment: v(content.equipment),
  },
});

const errors = [];
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();

async function run(name, { redFlag }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript((s) => { window.__FAKE_SEED__ = s; }, seed());
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  const btn = (n, o = {}) => page.getByRole('button', { name: n, ...o });
  const snap = async (n) => shots && page.screenshot({ path: `${shots}/${name}-${n}.png`, fullPage: true });

  await page.goto('http://localhost:8766/');
  await page.fill('#email', 'dana@demo'); await page.fill('#password', 'pw123456'); await btn('Sign in').click();
  await page.getByText('Setting up takes about 5 minutes').waitFor(); await snap('01-welcome');
  await btn('Let’s start').click();
  await btn('I understand what my clinic will see.').click(); await page.fill('.sign input', 'Dana Demo'); await snap('02-consent');
  await btn('Agree and continue').click();
  await page.getByText('A few health questions').waitFor();
  const qs = page.locator('.q');
  for (let i = 0; i < 3; i++) await qs.nth(i).getByRole('button', { name: i === 0 && redFlag ? 'Yes' : 'No', exact: true }).click();
  await qs.nth(3).getByRole('button', { name: 'Yes', exact: true }).click();
  await btn('Lying flat on my back').click();
  await page.fill('.sign input', 'Dana Demo'); await snap('03-screening');
  await btn('Continue').click();
  await btn('I’ve read this and agree to take part.').click(); await page.fill('.sign input', 'Dana Demo');
  await btn('Agree and continue').click();
  await btn('50–59').click(); await btn('None, or not in years').click(); await snap('04-about');
  await btn('Continue').click();
  const mq = page.locator('.q');
  await mq.nth(0).getByRole('button', { name: 'Yes', exact: true }).click();
  await mq.nth(1).getByRole('button', { name: 'No', exact: true }).click();
  await mq.nth(2).getByRole('button', { name: 'Not sure', exact: true }).click();
  await btn('Continue').click();
  await btn('Traditional / commercial gym').click(); await snap('05-where');
  await btn('Continue').click();
  await btn('Knees').click(); await btn('I’d rather not').click(); await snap('06-workarounds');
  await btn('Continue').click();
  for (const d of ['Mon', 'Wed', 'Fri']) await page.locator('.choices').nth(2).getByRole('button', { name: d, exact: true }).click();
  await snap('07-schedule');
  await btn('Continue').click();
  await btn('Keep my muscle while I lose weight').click(); await page.fill('textarea', 'Carry my grandkids without my knees hurting');
  await btn('Continue').click();
  if (redFlag) {
    await btn('Continue').click();
    await page.getByText('Let’s get you cleared first').waitFor(); await snap('08-paused');
    await btn('My doctor or clinic provider has told me').click(); await page.fill('.sign input', 'Dana Demo');
    await btn('I’m cleared, let’s start').click();
  } else {
    await btn('See my program').click();
  }
  await page.getByText('Your program').first().waitFor(); await snap('09-home');
  const db = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fake-db')));
  const p = db.tables.patients[0];
  const docs = db.tables.patient_documents.map((d) => d.doc_type).sort().join(',');
  const items = db.tables.cycle_items;
  const knees = items.filter((i) => i.exercise_id).map((i) => content.library.find((e) => e.id === i.exercise_id)).filter((e) => e.area_load.knees > 1);
  const supine = items.filter((i) => i.exercise_id).map((i) => content.library.find((e) => e.id === i.exercise_id)).filter((e) => e.restrictions.includes('supine'));
  console.log(`${name}: status=${p.status} docs=${docs} template=${db.tables.cycles[0]?.template_id} items=${items.length} ` +
    `levels SQ=${p.pattern_levels.SQ} HP=${p.pattern_levels.HP} restrictions=${p.restrictions} workarounds=${p.workarounds}`);
  if (p.status !== 'active') fail(`${name}: not active`);
  if (redFlag !== docs.includes('clearance')) fail(`${name}: clearance doc mismatch`);
  if (!db.tables.cycles.length || items.length < 15) fail(`${name}: cycle not built`);
  if (knees.length) fail(`${name}: knee-heavy exercise despite work-around: ${knees.map((e) => e.id)}`);
  if (supine.length) fail(`${name}: supine exercise despite restriction: ${supine.map((e) => e.id)}`);
  await ctx.close();
}

await run('happy', { redFlag: false });
await run('redflag', { redFlag: true });
await browser.close(); server.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
