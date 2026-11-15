// Browser smoke test for sprint 1 PR 4: a 60+ patient on a 2-day plan.
//   B15: the day after a workout home suggests a rest day (and still lets her start); the warm-up says about 7 minutes.
//   B4: both sessions of her 2-day plan include balance.
//   B3: a band exercise she has mastered twice shows the 3-second-lowering stage, and the stage is saved with the set.
//   node tests/browser/age60.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, fakeDb, signIn } from './harness.mjs';
import { chooseTemplate, materializeCycle } from '../../web/engine/cycle.js';
import { startingLevels } from '../../web/engine/levels.js';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();
const START = '2026-11-02';

const setup = content.setups.find((s) => s.setup === 'home_gym');
const patient = { status: 'active', experience: 'none', age_band: '60-69', setup: 'home_gym', equipment: setup.equipment.filter((e) => e !== 'none'),
  dumbbells_available: [5, 8, 10, 12, 15], days_per_week: 2, session_minutes: 30, goal: 'keep_muscle', start_date: START,
  pattern_levels: startingLevels({ experience: 'none', ageBand: '60-69' }) };
const S = seed(content, patient);
const template = chooseTemplate(content.templates, { cycleType: 'C1', daysPerWeek: 2, experienced: false });
const profile = { equipment: patient.equipment, patternLevels: patient.pattern_levels, workarounds: [], restrictions: [], floorOk: false };
const built = materializeCycle(template, content.slots, profile, content.library, { minutes: 30, ageBand: '60-69' });
S.tables.content_versions = [{ version: 1, is_current: true }];
S.tables.cycles = [{ id: 1, patient_id: 'u1', cycle_no: 1, template_id: template.template_id, content_version: 1, cycle_type: 'C1', start_date: START,
  session_minutes: 30, status: 'active', week_modes: {} }];
S.tables.cycle_items = built.sessions.flatMap((s) => s.items.map((it) => ({ cycle_id: 1, patient_id: 'u1', session: s.session, slot: it.slot.slot,
  ord: it.slot.ord, role: it.slot.role, pattern: it.slot.pattern, exercise_id: it.exercise?.id ?? null, reasons: it.reasons })));
const lib = Object.fromEntries(content.library.map((e) => [e.id, e]));
const second = template.sessions[1].session;
for (const s of template.sessions) {
  if (!S.tables.cycle_items.some((i) => i.session === s.session && i.pattern === 'BA' && i.exercise_id)) fail(`session ${s.session} has no balance (B4)`);
}
// Yesterday she did session 1; two earlier sessions on session 2's band exercise hit the top of the range + 2 at Good.
S.tables.session_logs = [{ id: 1, patient_id: 'u1', cycle_id: 1, week: 1, session: template.sessions[0].session, log_date: START, status: 'done',
  feel: 'right', energy: 'ok', soreness: 'none', sore_areas: [], workaround_areas: [], scaled: false }];
const bandItem = S.tables.cycle_items.find((i) => i.session === second && i.exercise_id && lib[i.exercise_id].load_type === 'band');
const slotRow = content.slots.find((x) => x.template_id === template.template_id && x.session === second && x.slot === bandItem?.slot);
const hi = Number(String(slotRow?.reps_by_week[0] ?? '10-12').split('-')[1]);
S.tables.exercise_logs = bandItem ? [1, 2].map((k) => ({ id: 900 + k, session_log_id: 800 + k, patient_id: 'u1', slot: bandItem.slot, exercise_id: bandItem.exercise_id,
  sets: [{ weight: 2, reps: hi + 2 }, { weight: 2, reps: hi + 2 }], rating: 'good', skipped: false, created_at: `2026-10-${20 + k}T10:00:00Z` })) : [];
if (!bandItem) console.log('note: no band exercise in session', second, '- the band check is skipped');

const { ctx, page, btn, snap, errors } = await openApp(browser, 'age60', S, { shots, time: '2026-11-03T09:00:00' });
const choice = (text) => page.locator('.choice', { hasText: text }).first();
await signIn(page);
await page.getByText('This week’s workouts').waitFor(); await snap('01-home-rest-day');
if (await page.locator('.hero [data-notice="rest_day"]').count() !== 1) fail('the day after a workout, 60+ should see the rest-day suggestion (B15)');
const start = page.locator('.home-action .btn-primary');
if (!/Start/.test(await start.textContent())) fail('she can still start a workout on a rest day');
await start.click();
await page.getByText('Energy today').waitFor();
await choice('OK').click(); await choice('Nothing today').click();
await btn('Start warm-up').click();
await page.getByText('Warm-up', { exact: true }).waitFor();
if (!/About 7 minutes/.test(await page.locator('.step .lead').textContent())) fail('60+ warm-up should say about 7 minutes');
await btn('Warm-up done').click();

if (bandItem) {
  const name = lib[bandItem.exercise_id].name;
  for (let k = 0; k < 15; k++) {
    await page.locator('.exercise h1').waitFor();
    if ((await page.locator('.exercise h1').textContent()) === name) break;
    await btn('Skip', { exact: true }).click();
  }
  await snap('02-band-tempo');
  const tempo = await page.locator('.exercise .tempo').textContent().catch(() => '');
  if (!/Lower for 3 seconds/.test(tempo)) fail(`band exercise should show the 3-second lowering stage, got "${tempo}" (B3)`);
  await page.getByRole('button', { name: 'Done set' }).click();
  await page.waitForTimeout(300);
  const db = await fakeDb(page);
  const row = db.tables.exercise_logs.find((e) => e.exercise_id === bandItem.exercise_id && e.session_log_id !== 801 && e.session_log_id !== 802);
  console.log(`band ${bandItem.exercise_id}: tempo "${tempo}" · saved set ${JSON.stringify(row?.sets?.[0])}`);
  if (row?.sets?.[0]?.stage !== 1) fail('the band stage should be saved with the set');
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
await ctx.close(); await browser.close(); server.close();
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
