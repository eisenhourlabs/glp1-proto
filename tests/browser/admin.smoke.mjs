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
t.ai_proposals = [{ id: 7, patient_id: 'u1', cycle_id: 1, created_at: '2026-11-03T10:00:00Z', source: 'ai', model: 'claude-sonnet-5-5', status: 'pending',
  input_summary: { cycle: { number: 1 } }, reflection: { note: 'Knees felt great' },
  output: { cycle_type: 'C2', days_per_week: 4, level_changes: [{ pattern: 'SQ', change: 1, evidence: 'Steady climb.' }], swaps: [], recap: 'Great cycle.', focus: 'Stronger legs', flags: [] },
  default_output: { cycle_type: 'C2', days_per_week: 3, level_changes: [], swaps: [], recap: 'Standard recap.', focus: 'Stronger legs', flags: [] },
  final: { cycle_type: 'C2', days_per_week: 3, level_changes: [], swaps: [], recap: 'Standard recap.', focus: 'Stronger legs', flags: [] },
  validation: { errors: [], review: ['recommends 4 days (she chose 3)'] } }];
t.patient_documents = [{ patient_id: 'u1', doc_type: 'consent', doc_version: 'consent-draft-2026-10-31', signed_at: '2026-11-01T10:00:00Z' }];

S.users.push({ id: 'cv', email: 'clinic@demo', password: 'pw123456' });
t.profiles.push({ id: 'cv', role: 'clinic_viewer', clinic_id: 'c1', display_name: 'Front desk' });
S.rpc = {
  clinic_report: { clinic: 'Lakeside Weight & Wellness', as_of: '2026-11-17', enrolled: 28, activated: 25, active_now: 23, active_7d: 18,
    active_28d: 22, workouts_28d: 190, strength: { patients_with_data: 17, patients_stronger: 14, avg_load_change_pct: 22 },
    weekly: [62, 70, 74, 71, 78, 80, 76, 40].map((p, i) => ({ week_start: `2026-${i < 3 ? '09' : i < 7 ? '10' : '11'}-${String(1 + i * 3).padStart(2, '0')}`, planned: 60, completed: Math.round(p * 0.6) })) },
  clinic_checkin_list: [
    { patient_name: 'Kim', joined: '2026-11-01', status: 'active', last_workout: '2026-11-02', days_since: 15, workouts_this_week: 0, workouts_last_week: 0, workouts_28d: 1, last_skip_reason: 'busy', last_skip_date: '2026-11-09', worth_a_call: true },
    { patient_name: 'Dana', joined: '2026-11-01', status: 'active', last_workout: '2026-11-16', days_since: 1, workouts_this_week: 1, workouts_last_week: 3, workouts_28d: 7, last_skip_reason: null, last_skip_date: null, worth_a_call: false },
  ],
};
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
await page.locator('section.card', { hasText: 'Lakeside' }).getByRole('link', { name: 'Staff kit' }).click();
await page.getByRole('heading', { name: 'Staff kit · LAKESIDE' }).waitFor();
await page.locator('.kit-poster svg').waitFor(); await snap('04b-kit');
if ((await page.locator('.kit-sheet svg').count()) !== 5) fail('4 cards + 1 poster QR codes');
if (!(await page.getByText('join.html?code=LAKESIDE').count())) fail('join link shown');
await page.getByRole('link', { name: '← Clinics' }).click();
await page.getByRole('heading', { name: 'Clinics', exact: true }).waitFor();

await page.getByRole('link', { name: 'Settings' }).click();
await page.getByRole('heading', { name: 'Settings' }).waitFor();
const input = page.locator('input[aria-label="scale_today.load_cut_pct"]');
await input.fill('12');
await page.locator('tr', { has: input }).getByRole('button', { name: 'Save' }).click();
await page.locator('tr', { has: input }).getByText('Saved').waitFor(); await snap('05-settings');

// AI review queue
await page.getByRole('link', { name: 'AI reviews' }).click();
await page.getByText('Waiting for you (1)').waitFor();
if (!(await page.getByText('recommends 4 days (she chose 3)').count())) fail('validation reason shown');
if (!(await page.getByText('Knees felt great').count())) fail('her note shown');
await snap('05b-ai');
await btn('Approve AI plan').click();
await page.getByText('Waiting for you (0)').waitFor();

// Status change and the clinic report from admin
await page.getByRole('link', { name: 'Patients' }).click();
await page.getByRole('link', { name: 'Rosa' }).click();
await btn('Clinic cleared her: resume').click();
await page.getByRole('button', { name: 'Pause' }).waitFor(); await snap('06-status');
await page.getByRole('link', { name: 'Clinics' }).click();
await page.locator('section.card', { hasText: 'Lakeside' }).getByRole('link', { name: 'Clinic report' }).click();
await page.getByText('Worth a check-in call (1)').waitFor(); await snap('07-admin-report');

const db = await fakeDb(page);
if (!db.tables.flags.find((f) => f.id === 1).resolved_by) fail('flag not resolved');
if (!db.tables.clinic_codes.some((k) => k.code === 'NORTH-1')) fail('code not added');
if (db.tables.app_settings.find((s) => s.key === 'scale_today.load_cut_pct').value !== 12) fail('setting not saved');
if (db.tables.ai_proposals[0].status !== 'approved' || db.tables.ai_proposals[0].final.days_per_week !== 4) fail('approval should apply the AI plan');
const rosa = db.tables.patients.find((p) => p.id === 'u2');
if (rosa.status !== 'active' || rosa.screening_flag !== 'cleared') fail('admin resume did not clear the screening pause');

// Clinic viewer
const cv = await openApp(browser, 'clinic', S, { shots, time: '2026-11-17T09:00:00' });
await signIn(cv.page, { path: 'clinic/', email: 'clinic@demo' });
await cv.page.getByText('Worth a check-in call (1)').waitFor(); await cv.snap('01-dashboard');
const tiles = await cv.page.locator('.stat').allTextContents();
console.log(`clinic tiles: ${tiles.join(' | ')}`);
if (!tiles.some((x) => /78%/.test(x))) fail('active % tile');
if (!(await cv.page.getByText('14 of 17 patients').count())) fail('strength line');
errors.push(...cv.errors);
await cv.ctx.close();

await ctx.close(); await browser.close(); server.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
