// Browser smoke test: the demo dataset (as demo.py would load it) seen through every screen the demo script uses.
//   node tests/browser/demo.smoke.mjs <content.json> <demo_seed.local.json> [screenshot-dir]
import { readFileSync } from 'node:fs';
import { chromium, serve, loadContent, seed, openApp, signIn } from './harness.mjs';
import { addDays } from '../../web/engine/util.js';

const content = loadContent(process.argv[2]);
const demo = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const shots = process.argv[4];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const TODAY = '2026-11-04';                     // a Wednesday, to show the data isn't tied to one weekday
const d = (off) => (off == null ? null : addDays(TODAY, off));

// Same mapping as scripts/demo.py Seeder, into the fake's tables.
function load() {
  const S = seed(content);
  const t = S.tables;
  let id = 1;
  S.users = []; t.profiles = []; t.patients = [];
  t.clinic_codes = [{ code: 'LAKESIDE', clinic_id: 'c1', active: true }];
  for (const k of ['patient_documents', 'cycles', 'cycle_items', 'session_logs', 'exercise_logs', 'flags', 'adjustments', 'ai_proposals']) t[k] = [];
  for (const s of demo.staff) {
    S.users.push({ id: s.login, email: `${s.login}@glp1demo.example`, password: 'pw123456' });
    t.profiles.push({ id: s.login, role: s.role, clinic_id: s.role === 'admin' ? null : 'c1', display_name: s.name, is_demo: true });
  }
  for (const p of demo.personas) {
    const uid = p.login ?? p.key.toLowerCase();
    S.users.push({ id: uid, email: `${uid}@glp1demo.example`, password: 'pw123456' });
    t.profiles.push({ id: uid, role: 'patient', clinic_id: 'c1', display_name: p.name, is_demo: true, created_at: `${d(p.joined_day)}T09:00:00Z` });
    t.patients.push({ id: uid, ...p.patient, start_date: d(p.start_day) });
    for (const doc of p.documents) t.patient_documents.push({ patient_id: uid, ...doc, signed_at: `${d(doc.day)}T09:05:00Z` });
    const cycles = {};
    for (const c of p.cycles) {
      cycles[c.cycle_no] = id++;
      t.cycles.push({ id: cycles[c.cycle_no], patient_id: uid, cycle_no: c.cycle_no, template_id: c.template_id, content_version: 1, cycle_type: c.cycle_type,
        start_date: d(c.start_day), session_minutes: c.session_minutes, status: c.status, week_modes: c.week_modes });
      for (const i of c.items) t.cycle_items.push({ cycle_id: cycles[c.cycle_no], patient_id: uid, ...i });
    }
    const refs = {};
    for (const l of [...p.session_logs].sort((a, b) => a.day - b.day || a.ref - b.ref)) {
      refs[l.ref] = id++;
      t.session_logs.push({ id: refs[l.ref], patient_id: uid, cycle_id: cycles[l.cycle_no], week: l.week, session: l.session, log_date: d(l.day), status: l.status,
        energy: l.energy ?? null, scaled: Boolean(l.scaled), feel: l.feel ?? null, soreness: l.soreness ?? null, sore_areas: l.sore_areas ?? [],
        workaround_areas: l.workaround_areas ?? [], skip_reason: l.skip_reason ?? null, note: null });
    }
    for (const e of p.exercise_logs) t.exercise_logs.push({ id: id++, session_log_id: refs[e.log_ref], patient_id: uid, slot: e.slot, exercise_id: e.exercise_id,
      sets: e.sets, rating: e.rating, skipped: false, created_at: `${d(e.day)}T${e.time}:00Z` });
    for (const f of p.flags) t.flags.push({ id: id++, patient_id: uid, type: f.type, detail: f.detail, created_at: `${d(f.day)}T18:00:00Z`, resolved_at: f.resolved ? `${d(f.day + 1)}T10:00:00Z` : null });
    for (const a of p.adjustments) t.adjustments.push({ id: id++, patient_id: uid, cycle_id: cycles[a.cycle_no], type: a.type, reason: a.reason, detail: a.detail, created_at: `${d(a.day)}T18:05:00Z` });
    for (const r of p.proposals) t.ai_proposals.push({ id: id++, patient_id: uid, cycle_id: cycles[r.cycle_no], applied_cycle_id: cycles[r.applied_cycle_no], ...r, created_at: `${d(r.day)}T08:00:00Z` });
  }
  t.content_versions = [{ version: 1, is_current: true, imported_at: '2026-10-31T00:00:00Z', source_file: 'x.xlsx', summary: {} }];
  return S;
}

const S = load();
const browser = await chromium.launch();
const errors = [];
async function as(who, path, name, check) {
  const app = await openApp(browser, name, S, { shots, time: `${TODAY}T09:00:00` });
  await signIn(app.page, { path, email: `${who}@glp1demo.example` });
  await check(app);
  errors.push(...app.errors);
  await app.ctx.close();
}

await as('dana', '', 'demo-dana', async ({ page, snap }) => {
  await page.getByText('Week 9: time for your cycle review').waitFor(); await snap('home');
  await page.getByRole('button', { name: 'Your cycle review' }).click();
  await page.getByText('Your Cycle 1 review').waitFor(); await snap('review');
  const stats = await page.locator('.stat').allTextContents();
  console.log(`Dana review: ${stats.join(' | ')}`);
});
await as('lisa', '', 'demo-lisa', async ({ page, snap }) => {
  await page.getByText('Welcome back! Today is a little lighter').waitFor(); await snap('home');
});
await as('maria', '', 'demo-maria', async ({ page, snap }) => {
  await page.getByText('This week’s workouts').waitFor();
  const eyebrow = await page.locator('.hero .eyebrow').textContent();
  console.log(`Maria: ${eyebrow}`);
  if (!/2 days · Week 5 of 9/.test(eyebrow)) fail('Maria should be in week 5 of a 2-day plan');
  await snap('home');
});
// The clinic dashboard runs SQL report functions the fake can't; its numbers were checked against real Postgres.
await as('brad', 'admin/', 'demo-admin', async ({ page, snap }) => {
  await page.getByRole('heading', { name: 'Patients' }).waitFor();
  const rows = await page.locator('table.data tbody tr').count();
  console.log(`admin: ${rows} patients listed; markers: ${(await page.locator('.tags .pill').allTextContents()).join(', ')}`);
  if (rows !== 30) fail('30 demo patients expected');
  await snap('patients');
  await page.getByRole('link', { name: 'Dana' }).click();
  await page.getByText('Workouts and check-ins').waitFor(); await snap('dana');
  await page.getByRole('link', { name: 'Flags' }).click(); await page.getByRole('heading', { name: 'Open flags' }).waitFor(); await snap('flags');
  await page.getByRole('link', { name: 'AI reviews' }).click(); await page.getByText(/Waiting for you/).waitFor(); await snap('ai');
});
await browser.close(); server.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
