// Browser smoke test for backlog B13 (benchmarks, built switched off):
//   - switched off (the default): no card, no progress section, nothing written, nothing read
//   - switched on: a "Quick strength tests" card appears at her second workout with the draft-wording line; every test
//     can be skipped; bad values and a missing version are refused; saved results land once with the right moment and
//     cycle; the card goes away; the progress screen shows them; in week 9 the transition set is offered, "Not now" is
//     remembered, and first-vs-latest shows the change; a save with no signal is sent when it returns
//   node tests/browser/benchmarks.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, signIn, fakeDb } from './harness.mjs';
import { chooseTemplate, materializeCycle } from '../../web/engine/cycle.js';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();
const gym = content.setups.find((s) => s.setup === 'commercial_gym');
const levels = { SQ: 1, HI: 1, SL: 1, HP: 1, VP: 1, HR: 1, VR: 1, CA: 1, CO: 1, BA: 1, HA: 1, AR: 1 };
const base = { status: 'active', experience: 'none', age_band: '40-49', setup: 'commercial_gym', equipment: gym.equipment.filter((e) => e !== 'none'),
  days_per_week: 3, session_minutes: 45, goal: 'keep_muscle', pattern_levels: levels, start_date: '2026-11-02' };
const template = chooseTemplate(content.templates, { cycleType: 'C1', daysPerWeek: 3, experienced: false });
const profile = { equipment: base.equipment, patternLevels: levels, workarounds: [], restrictions: [], floorOk: false };
const items = materializeCycle(template, content.slots, profile, content.library, { minutes: 45 })
  .sessions.flatMap((s) => s.items.map((it) => ({ cycle_id: 1, patient_id: 'u1', session: s.session, slot: it.slot.slot,
    ord: it.slot.ord, role: it.slot.role, pattern: it.slot.pattern, exercise_id: it.exercise?.id ?? null, reasons: it.reasons })));
const order = template.sessions.map((s) => s.session);
const log = (id, date, week, session) => ({ id, patient_id: 'u1', cycle_id: 1, week, session, log_date: date, status: 'done', feel: 'right',
  energy: 'ok', soreness: 'none', sore_areas: [], workaround_areas: [], scaled: false });

// Weeks 1 and 2 complete, week 3 (today, Monday 16 Nov) has one workout done: 7 workouts, weekly streak 2.
const S = seed(content, base);
S.tables.content_versions = [{ version: 1, is_current: true }];
S.tables.cycles = [{ id: 1, patient_id: 'u1', cycle_no: 1, template_id: template.template_id, content_version: 1, cycle_type: 'C1', start_date: '2026-11-02',
  session_minutes: 45, status: 'active', week_modes: {} }];
S.tables.cycle_items = items;
S.tables.session_logs = [...order.map((s, i) => log(1 + i, `2026-11-0${2 + i}`, 1, s)), ...order.map((s, i) => log(11 + i, `2026-11-${String(9 + i).padStart(2, '0')}`, 2, s)), log(21, '2026-11-14', 3, order[0])];
S.tables.exercise_logs = []; S.tables.flags = []; S.tables.adjustments = [];


const withSetting = (on) => { const s = structuredClone(S); if (on !== undefined) s.tables.app_settings = [...s.tables.app_settings.filter((r) => r.key !== 'benchmarks.enabled'), { key: 'benchmarks.enabled', value: on }]; s.tables.benchmarks = []; return s; };
const rowsOf = async (page) => (await fakeDb(page)).tables.benchmarks ?? [];

// ── switched off: not set, and set to false ──
for (const on of [undefined, false]) {
  const a = await openApp(browser, `off-${on}`, withSetting(on), { shots, time: '2026-11-16T09:00:00' });
  await signIn(a.page);
  await a.page.getByText('This week’s workouts').waitFor();
  if (await a.page.locator('[data-benchmarks]').count()) fail(`off (${on}): a benchmark card is showing`);
  await a.btn('Your progress').click();
  await a.page.getByRole('heading', { name: 'Your progress' }).waitFor();
  if (await a.page.locator('[data-benchmarks-progress]').count()) fail(`off (${on}): a benchmark section is showing`);
  if ((await rowsOf(a.page)).length) fail(`off (${on}): benchmark rows exist`);
  if (a.errors.length) fail(a.errors.join('\n'));
  await a.ctx.close();
}

// ── switched on: baseline at her second workout ──
const { ctx, page, btn, snap, errors } = await openApp(browser, 'bench', withSetting(true), { shots, time: '2026-11-16T09:00:00' });
await signIn(page);
await page.getByText('This week’s workouts').waitFor();
const card = page.locator('[data-benchmarks="baseline"]');
await card.waitFor();
if (!(await card.textContent()).includes('Draft wording')) fail('the card should carry the draft-wording line while the copy is placeholder');
await snap('01-home-card');
await card.getByRole('button', { name: 'Try them' }).click();
await page.getByRole('heading', { name: 'Quick strength tests' }).waitFor();
const f = await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.textContent?.trim());
if (f !== 'H1:Quick strength tests') fail(`focus should be on the heading, got ${f}`);
await snap('02-tests');
const status = () => page.locator('[role="status"]').last().textContent();

await btn('Save my results').click();
if (!(await status()).includes('Add at least one result')) fail(`empty save: ${await status()}`);
await page.fill('#bench-lower_body', '12x');
await btn('Save my results').click();
if (!(await status()).includes('whole number from 0 to 60')) fail(`bad value: ${await status()}`);
await page.fill('#bench-lower_body', '12');
await page.fill('#bench-upper_body', '6');
await btn('Save my results').click();
if (!(await status()).includes('choose which version')) fail(`missing version: ${await status()}`);
if ((await rowsOf(page)).length) fail('nothing should be saved while the form has a problem');
await btn('Wall', { exact: true }).click();
await page.locator('[data-test="carry_hold"]').getByRole('button', { name: 'Skip this test' }).click();
if (await page.locator('#bench-carry_hold').isEnabled()) fail('a skipped test should be disabled');
await btn('Save my results').click();
await page.getByText('This week’s workouts').waitFor();
let rows = await rowsOf(page);
const brief = rows.map((r) => `${r.moment}/${r.test}/${r.value}/${r.variant}/cycle${r.cycle_id}`).sort().join(' ');
if (brief !== 'baseline/lower_body/12/null/cycle1 baseline/upper_body/6/wall/cycle1') fail(`saved rows: ${brief}`);
if (rows.some((r) => !r.client_ref)) fail('every result carries a client_ref');
if (await page.locator('[data-benchmarks]').count()) fail('the card should be gone once she has saved');

await btn('Your progress').click();
await page.getByRole('heading', { name: 'Your progress' }).waitFor();
const sec = (await page.locator('[data-benchmarks-progress]').textContent()).replace(/\s+/g, ' ');
if (!/Lower-body test12 reps/.test(sec) || !/Upper-body test6 reps \(Wall\)/.test(sec)) fail(`progress section: ${sec}`);
if (/Hold test/.test(sec)) fail('a skipped test should not appear');
await snap('03-progress');
await btn('Back to home').click();

// ── a save with no signal is sent when it returns ──
const o = await openApp(browser, 'bench-offline', withSetting(true), { shots, time: '2026-11-16T09:00:00' });
await signIn(o.page);
await o.page.locator('[data-benchmarks="baseline"]').getByRole('button', { name: 'Try them' }).click();
await o.page.fill('#bench-carry_hold', '30');
await o.ctx.setOffline(true);
await o.btn('Save my results').click();
await o.page.getByText('This week’s workouts').waitFor();
if ((await rowsOf(o.page)).length) fail('offline: the server should not have it yet');
if (await o.page.locator('[data-benchmarks]').count()) fail('offline: the card should already be gone (the result is saved on the phone)');
await o.ctx.setOffline(false);
for (let i = 0; i < 40 && !(await rowsOf(o.page)).length; i++) await o.page.waitForTimeout(250);
const sent = await rowsOf(o.page);
if (sent.length !== 1 || sent[0].test !== 'carry_hold' || sent[0].value !== 30) fail(`offline save was not sent once: ${JSON.stringify(sent)}`);
await o.ctx.close();

// ── week 9: the transition set; "Not now" is remembered; first against latest ──
const wk9 = withSetting(true);
wk9.tables.benchmarks = rows.map((r) => ({ ...r, id: r.id, created_at: '2026-11-16T15:00:00.000Z' }));
// a workout on the last day of week 8 keeps this from being a comeback after a long gap
wk9.tables.session_logs = [...S.tables.session_logs, log(31, '2026-12-27', 8, order[0])];
const t = await openApp(browser, 'bench-wk9', wk9, { shots, time: '2026-12-29T09:00:00' });
await signIn(t.page);
await t.page.locator('[data-benchmarks="transition"]').waitFor();
await t.page.locator('[data-benchmarks="transition"]').getByRole('button', { name: 'Try them' }).click();
await t.page.getByRole('heading', { name: 'Quick strength tests' }).waitFor();
if (!(await t.page.locator('main').textContent()).includes('The same tests again')) fail('the transition screen should say it is the same tests again');
await t.btn('Not now').click();
await t.page.getByText('This week’s workouts').waitFor();
if (await t.page.locator('[data-benchmarks]').count()) fail('"Not now" should hide the card');
await t.page.reload();
await t.page.getByText('This week’s workouts').waitFor();
if (await t.page.locator('[data-benchmarks]').count()) fail('"Not now" should be remembered on this phone');
if ((await rowsOf(t.page)).length !== 2) fail('"Not now" must not write anything');
await t.ctx.close();

const t2 = await openApp(browser, 'bench-wk9b', wk9, { shots, time: '2026-12-29T09:00:00' });
await signIn(t2.page);
await t2.page.locator('[data-benchmarks="transition"]').getByRole('button', { name: 'Try them' }).click();
await t2.page.fill('#bench-lower_body', '15');
await t2.page.fill('#bench-upper_body', '8');
await t2.btn('Incline').click();
await t2.btn('Save my results').click();
await t2.page.getByText('This week’s workouts').waitFor();
await t2.btn('Your progress').click();
await t2.page.getByRole('heading', { name: 'Your progress' }).waitFor();
const sec2 = (await t2.page.locator('[data-benchmarks-progress]').textContent()).replace(/\s+/g, ' ');
if (!/12 → 15 reps/.test(sec2) || !/\+3 reps/.test(sec2)) fail(`first against latest: ${sec2}`);
if (!/6 → 8 reps \(Incline\)/.test(sec2) || !/different version/.test(sec2)) fail(`a different version should not show a change: ${sec2}`);
await t2.snap('04-progress-change');
const moments = (await rowsOf(t2.page)).map((r) => r.moment).sort().join();
if (moments !== 'baseline,baseline,transition,transition') fail(`moments: ${moments}`);
await t2.ctx.close();

const real = [...errors, ...o.errors, ...t.errors, ...t2.errors].filter((e) => !/Failed to load resource|net::ERR/.test(e));
if (real.length) fail(real.join('\n'));
await ctx.close(); await browser.close(); server.close();
console.log(`benchmarks: off twice, baseline saved ${brief.split(' ').length}, offline save sent, week 9 shown`);
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
