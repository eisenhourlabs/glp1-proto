// Browser smoke test: the admin pages against seeded data (patients, logs, flags, adjustments, clinics, settings).
//   node tests/browser/admin.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, fakeDb, signIn } from './harness.mjs';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();

const S = seed(content, { status: 'active', age_band: '50-59', experience: 'none', setup: 'home_gym', equipment: ['db', 'band', 'chair'],
  days_per_week: 3, session_minutes: 45, goal: 'keep_muscle', goal_words: 'Carry my grandkids', start_date: '2026-11-02', pattern_levels: { SQ: 2, HP: 1 } });
const t = S.tables;
S.users.push({ id: 'adm', email: 'admin@demo', password: 'pw123456' });
t.profiles.push({ id: 'adm', role: 'admin', clinic_id: null, display_name: 'Troy' },
  { id: 'u2', role: 'patient', clinic_id: 'c2', display_name: 'Rosa', is_demo: true },
  { id: 'u3', role: 'patient', clinic_id: 'c1', display_name: 'Kim', is_demo: true });
t.clinics.push({ id: 'c2', name: 'Riverside Medical Weight Loss', accent_color: '#2f6f68', status: 'active', is_demo: true });
t.clinic_codes = [{ code: 'LAKESIDE', clinic_id: 'c1', active: true }];
t.patients.push({ id: 'u2', status: 'paused', screening_flag: 'pause', days_per_week: 2, equipment: [], workarounds: [], restrictions: [], pattern_levels: {}, dumbbells_available: [] },
  { id: 'u3', status: 'active', screening_flag: 'none', days_per_week: 3, start_date: '2026-11-02', equipment: [], workarounds: [], restrictions: [], pattern_levels: {}, dumbbells_available: [] });
t.content_versions = [{ version: 1, imported_at: '2026-10-31T15:00:00Z', source_file: 'GLP1_Program_Master.xlsx', is_current: true, summary: { exercises: 109, slots: 185 } }];
t.cycles = [{ id: 1, patient_id: 'u1', cycle_no: 1, template_id: 'C1-3D', start_date: '2026-11-02', status: 'active', week_modes: {} },
  { id: 2, patient_id: 'u3', cycle_no: 1, template_id: 'C1-3D', start_date: '2026-11-02', status: 'active', week_modes: {} }];
const log = (id, pid, cyc, date, week, session, o = {}) => ({ id, patient_id: pid, cycle_id: cyc, log_date: date, week, session, status: 'done',
  scaled: false, energy: 'ok', feel: 'right', soreness: 'none', sore_areas: [], workaround_areas: [], note: null, ...o });
t.session_logs = [
  log(10, 'u1', 1, '2026-11-02', 1, 'A', { feel: 'too_hard', note: 'Squats felt tough' }), log(11, 'u1', 1, '2026-11-04', 1, 'B'),
  log(12, 'u1', 1, '2026-11-06', 1, 'C', { soreness: 'some', sore_areas: ['knees'] }), log(13, 'u1', 1, '2026-11-10', 2, 'A', { scaled: true, energy: 'low' }),
  log(14, 'u1', 1, '2026-11-12', 2, null, { status: 'skipped', skip_reason: 'busy', feel: null }),
  log(20, 'u3', 2, '2026-11-02', 1, 'A'),
];
t.exercise_logs = [
  { exercise_id: 'SQ04', sets: [{ weight: 10, reps: 12 }], skipped: false, created_at: '2026-11-02T10:00:00Z', patient_id: 'u1' },
  { exercise_id: 'SQ04', sets: [{ weight: 15, reps: 10 }], skipped: false, created_at: '2026-11-10T10:00:00Z', patient_id: 'u1' },
];
t.flags = [{ id: 1, patient_id: 'u1', type: 'dizzy', detail: { session_log_id: 13 }, created_at: '2026-11-10T10:20:00Z', resolved_at: null },
  { id: 2, patient_id: 'u2', type: 'screening', detail: {}, created_at: '2026-11-03T09:00:00Z', resolved_at: null }];
t.adjustments = [{ id: 1, patient_id: 'u1', cycle_id: 1, type: 'lighter_week_next', reason: 'low_energy_week', detail: { week: 3 }, created_at: '2026-11-12T10:00:00Z' }];
t.patient_documents = [{ patient_id: 'u1', doc_type: 'consent', doc_version: 'consent-draft-2026-10-31', signed_at: '2026-11-01T10:00:00Z' }];

const { ctx, page, btn, snap, errors } = await openApp(browser, 'admin', S, { shots, time: '2026-11-17T09:00:00' });
await signIn(page, { path: 'admin/', email: 'admin@demo' });
await page.getByRole('heading', { name: 'Patients' }).waitFor(); await snap('01-patients');
const rows = await page.locator('table.data tbody tr').allTextContents();
console.log(rows.map((r) => r.replace(/\s+/g, ' ')).join('\n'));
if (rows.length !== 3) fail('three patients expected');
if (!rows.some((r) => /Dana.*1 flag/.test(r))) fail('Dana should show a flag');
if (!rows.some((r) => /Kim.*Call/.test(r))) fail('Kim (no workout in 15 days) should be on the call list');
await page.selectOption('select[aria-label="Clinics"]', 'c2');
if ((await page.locator('table.data tbody tr').count()) !== 1) fail('clinic filter');
await page.selectOption('select[aria-label="Clinics"]', '');

await page.getByRole('link', { name: 'Dana' }).click();
await page.getByText('Workouts and check-ins').waitFor(); await snap('02-patient');
for (const txt of ['Squats felt tough', 'lighter week next', 'Goblet Box Squat', '10 lb → 15 lb', 'Felt dizzy or unwell', 'Busy']) {
  if (!(await page.getByText(txt, { exact: false }).count())) fail(`patient page missing "${txt}"`);
}
await page.locator('.flag.open').getByRole('button', { name: 'Resolve' }).click();
await page.locator('.flag:not(.open)').first().waitFor();

await page.getByRole('link', { name: 'Flags' }).click();
await page.getByRole('heading', { name: 'Open flags' }).waitFor(); await snap('03-flags');
if ((await page.locator('.flag.open').count()) !== 1) fail('one open flag left (screening)');

await page.getByRole('link', { name: 'Clinics' }).click();
await page.getByRole('heading', { name: 'Clinics', exact: true }).waitFor();
await page.fill('input[aria-label="Clinic name"]', 'Northside Wellness');
await btn('Create clinic').click();
await page.getByRole('heading', { name: /Northside Wellness/ }).waitFor();
const card = page.locator('section.card', { has: page.getByRole('heading', { name: /Northside Wellness/ }) });
await card.locator('input[aria-label^="New code"]').fill('north-1');
await card.getByRole('button', { name: 'Add code' }).click();
await page.getByText('NORTH-1').waitFor(); await snap('04-clinics');

await page.getByRole('link', { name: 'Settings' }).click();
await page.getByRole('heading', { name: 'Settings' }).waitFor();
const input = page.locator('input[aria-label="scale_today.load_cut_pct"]');
await input.fill('12');
await page.locator('tr', { has: input }).getByRole('button', { name: 'Save' }).click();
await page.locator('tr', { has: input }).getByText('Saved').waitFor(); await snap('05-settings');

const db = await fakeDb(page);
if (!db.tables.flags.find((f) => f.id === 1).resolved_by) fail('flag not resolved');
if (!db.tables.clinic_codes.some((k) => k.code === 'NORTH-1')) fail('code not added');
if (db.tables.app_settings.find((s) => s.key === 'scale_today.load_cut_pct').value !== 12) fail('setting not saved');

await ctx.close(); await browser.close(); server.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
