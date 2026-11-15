// Browser smoke test for backlog C6 (accessibility and small UX fixes), on top of the axe scan that every smoke runs:
//   - the page is not one big aria-live region; each new screen moves focus to its heading
//   - the "I feel dizzy or unwell" control is at least 48 px high
//   - the progress tiles say what they count (workouts, weekly streak, best weekly streak) and the weekly rows have text
//   - at 200% text size nothing scrolls sideways and the dizzy control stays on screen
//   node tests/browser/a11y.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, signIn } from './harness.mjs';
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

const { ctx, page, btn, snap, errors } = await openApp(browser, 'a11y', S, { shots, time: '2026-11-16T09:00:00' });
const focused = () => page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim().slice(0, 60) }));
const overflow = (label) => page.evaluate((l) => {
  const w = document.documentElement.scrollWidth - window.innerWidth;
  return w > 1 ? `${l}: scrolls sideways by ${w}px` : null;
}, label);
const check200 = async (label) => {
  const o = await overflow(label); if (o) fail(`at 200% text, ${o}`);
};

await signIn(page);
await page.getByText('This week’s workouts').waitFor();
if (await page.evaluate(() => document.querySelector('main')?.hasAttribute('aria-live'))) fail('<main> must not be an aria-live region');
await snap('01-home');

// ── progress tiles and weekly rows ──
await btn('Your progress').click();
await page.getByRole('heading', { name: 'Your progress' }).waitFor();
let f = await focused();
if (f.tag !== 'H1' || f.text !== 'Your progress') fail(`focus should be on the progress heading, got ${JSON.stringify(f)}`);
const tiles = (await page.locator('.stat').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
if (tiles.join('|') !== '7workouts|2weekly streak|2best weekly streak') fail(`progress tiles: ${tiles.join(' | ')}`);
const rows = (await page.locator('.week-row').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
if (rows.join('|') !== 'Week 13 of 3|Week 23 of 3|Week 31 of 3') fail(`weekly rows: ${rows.join(' | ')}`);
if (!(await page.getByText('Your weekly streak counts the weeks you finished every planned workout').count())) fail('weekly streak note missing');
await snap('02-progress');
await page.getByRole('button', { name: 'Back to home' }).click();
await page.getByText('This week’s workouts').waitFor();

// ── readiness → warm-up → exercise: each screen takes focus; the dizzy control is big ──
await page.locator('.home-action .btn-primary').click();
await page.getByText('Energy today').waitFor();
f = await focused(); if (f.tag !== 'H1' || !/^Ready for /.test(f.text)) fail(`readiness: focus ${JSON.stringify(f)}`);
await page.locator('.choice', { hasText: 'OK' }).first().click();
await page.locator('.choice', { hasText: 'Nothing today' }).click();
await btn('Start warm-up').click();
await page.getByText('Warm-up', { exact: true }).waitFor();
await snap('03-warmup');
await btn('Warm-up done').click();
await page.locator('.exercise h1').waitFor();
f = await focused(); if (f.tag !== 'H1' || f.text !== (await page.locator('.exercise h1').textContent())) fail(`exercise: focus ${JSON.stringify(f)}`);
const dizzy = await btn('I feel dizzy or unwell').boundingBox();
if (!dizzy || dizzy.height < 47.5) fail(`dizzy control is ${dizzy?.height}px high; needs 48`);
await snap('04-exercise');

// ── 200% text size ──
await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
await page.waitForTimeout(100);
await check200('exercise screen');
const big = await btn('I feel dizzy or unwell').boundingBox();
if (!big || big.x < 0 || big.x + big.width > 391) fail(`at 200%, the dizzy control is off screen (${JSON.stringify(big)})`);
if (big && big.height < 47.5) fail('at 200% the dizzy control shrank');
await snap('05-exercise-200');
await btn('I feel dizzy or unwell').click();
await page.getByText('Stop and sit down').waitFor();
const sheet = await page.locator('.sheet').boundingBox();
if (!sheet || sheet.x < -1 || sheet.x + sheet.width > 391) fail('dizzy sheet is wider than the screen at 200%');
await snap('06-dizzy-200');
await btn('I feel OK now. Keep going').click();
f = await focused(); if (f.tag !== 'BUTTON') fail(`closing the sheet should return focus to the dizzy button, got ${JSON.stringify(f)}`);
await page.reload();
await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
await page.getByText('This week’s workouts').waitFor();
await check200('home'); await snap('07-home-200');
await btn('Your progress').click();
await page.getByRole('heading', { name: 'Your progress' }).waitFor();
await check200('progress'); await snap('08-progress-200');

// ── onboarding: every step takes focus ──
const O = seed(content, { status: 'onboarding' });
const o = await openApp(browser, 'a11y-onboarding', O, { shots, time: '2026-11-16T09:00:00' });
await signIn(o.page);
await o.page.getByRole('heading', { name: /^Welcome/ }).waitFor();
const seen = [];
for (let i = 0; i < 3; i++) {
  const g = await o.page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.trim() }));
  if (g.tag !== 'H1') fail(`onboarding step ${i + 1}: focus is on ${JSON.stringify(g)}, not the heading`);
  seen.push(g.text);
  if (i === 0) await o.btn('Let’s start').click();
  else break;
  await o.page.waitForFunction((t) => document.activeElement?.tagName === 'H1' && document.activeElement.textContent.trim() !== t, g.text);
}
await o.snap('01-step');
errors.push(...o.errors);
await ctx.close(); await o.ctx.close();

const real = errors.filter((e) => !/Failed to load resource/.test(e));
if (real.length) fail(real.join('\n'));
await browser.close(); server.close();
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
