// Browser smoke test: an active patient does her first workout (readiness, Scale today, warm-up, find-your-weight,
// rest timer, the dizzy sheet, a swap, a work-around), then comes back a week later and sees last time's weights.
//   node tests/browser/workout.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, fakeDb, signIn } from './harness.mjs';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();

const home = content.setups.find((s) => s.setup === 'home_gym');
const patient = {
  status: 'active', experience: 'none', age_band: '50-59', setup: 'home_gym',
  equipment: home.equipment.filter((e) => e !== 'none'), dumbbells_available: [5, 8, 10, 12, 15, 20],
  days_per_week: 3, session_minutes: 45, goal: 'keep_muscle', start_date: '2026-11-02',
  workout1_check: { sitToStand: true, inclinePushup: true, hinge: true },
};
const { ctx, page, btn, snap, errors } = await openApp(browser, 'workout', seed(content, patient), { shots, time: '2026-11-02T09:00:00' });
const choice = (scope, text) => scope.locator('.choice', { hasText: text }).first();
const visible = async (loc) => (await loc.count()) > 0 && loc.first().isVisible();

await signIn(page);
await page.getByText('This week’s workouts').waitFor(); await snap('01-home');
const startBtn = page.locator('.home-action .btn-primary');
if (!/Start Full body A/.test(await startBtn.textContent())) fail('first workout should be A');
await startBtn.click();

// Readiness: low energy → offered Scale today.
await page.getByText('Energy today').waitFor();
await choice(page, 'Low').click();
await page.getByText('Want to scale today?').waitFor();
await choice(page, 'Yes, scale today').click();
await choice(page, 'Nothing today').click(); await snap('02-readiness');
await btn('Start warm-up').click();
await page.getByText('Warm-up', { exact: true }).waitFor(); await snap('03-warmup');
await btn('Warm-up done').click();

let guard = 0; let n = 0; let did = { dizzy: false, swap: false, hurt: false };
while (guard++ < 400) {
  if (await visible(page.getByText('Last one done!'))) break;
  const eyebrow = await page.locator('.exercise .eyebrow').textContent().catch(() => '');
  n = Number((eyebrow.match(/Exercise (\d+)/) || [])[1] || 0);
  if (n === 1 && !did.dizzy) {
    did.dizzy = true;
    await btn('I feel dizzy or unwell').click();
    await page.getByText('Stop and sit down').waitFor();
    await page.getByText('We’ve let the program team know').waitFor(); await snap('04-dizzy');
    await btn('I feel OK now. Keep going').click();
    continue;
  }
  if (n === 2 && !did.swap) {
    did.swap = true;
    const before = await page.locator('.exercise h1').textContent();
    await btn('Swap', { exact: true }).click();
    const sheet = page.locator('.sheet');
    await sheet.waitFor(); await snap('05-swap');
    const opts = sheet.locator('.btn-quiet');
    if (await opts.count()) { await opts.first().click(); await page.waitForFunction((b) => document.querySelector('.exercise h1')?.textContent !== b, before); }
    else await sheet.getByRole('button', { name: 'OK' }).click();
    continue;
  }
  if (n === 3 && !did.hurt) {
    did.hurt = true;
    await btn('Something hurts').click();
    const sheet = page.locator('.sheet');
    await choice(sheet, 'Tight').click(); await choice(sheet, 'Knees').click(); await snap('06-hurts');
    await sheet.getByRole('button', { name: 'Continue' }).click();
    continue;
  }
  const cur = page.locator('.set.current');
  if (await visible(cur)) {
    const wi = cur.locator('.weight-input');
    if ((await wi.count()) && !(await wi.inputValue())) await wi.fill('10');
    if (n === 1 && (await page.locator('.set.done').count()) === 1) await snap('07-set2');
    await cur.getByRole('button', { name: 'Done set' }).click();
    continue;
  }
  const findCard = page.locator('.card.soft', { hasText: 'How was that weight?' });
  if (await visible(findCard)) { await choice(findCard, 'Good').click(); continue; }
  const rateCard = page.locator('.card.soft', { hasText: 'How did that feel?' });
  if (await visible(rateCard)) { await choice(rateCard, 'Good').click(); continue; }
  await page.waitForTimeout(50);
}
await snap('08-last');
await btn('Finish workout').click();
await page.getByText('Workout done. Nice work!').waitFor(); await snap('09-finish');
await btn('Back to home').click();
await page.getByText('Done for today').waitFor(); await snap('10-home-after');

let db = await fakeDb(page);
const s1 = db.tables.session_logs[0];
const ex1 = db.tables.exercise_logs.filter((e) => e.session_log_id === s1.id);
console.log(`day 1: status=${s1.status} scaled=${s1.scaled} energy=${s1.energy} exercises=${ex1.length} ` +
  `swapped=${ex1.filter((e) => e.swapped_from).map((e) => `${e.swapped_from}->${e.exercise_id}(${e.swap_reason})`).join(' ')} ` +
  `flags=${db.tables.flags.map((f) => f.type)}`);
if (s1.status !== 'done') fail('day 1 should be done');
if (db.tables.cycles.length !== 1) fail('exactly one cycle');
if (!s1.scaled) fail('day 1 should be scaled');
if (!db.tables.flags.some((f) => f.type === 'dizzy')) fail('dizzy flag missing');
if (!ex1.length || ex1.some((e) => !e.skipped && (!e.sets.length || !e.rating))) fail('every exercise should be logged and rated');
const kneeHeavy = ex1.filter((e) => !e.skipped && e.swap_reason !== 'choice')
  .filter((e, i) => i >= 2 && content.library.find((x) => x.id === e.exercise_id)?.area_load.knees > 1);
if (kneeHeavy.length) fail(`knee-heavy exercise after the work-around: ${kneeHeavy.map((e) => e.exercise_id)}`);

// A week later: week 2, A again, with last time's weights.
await page.clock.setFixedTime(new Date('2026-11-09T09:00:00'));
await page.reload();
await page.getByText('This week’s workouts').waitFor();
if (!/Week 2 of 9/.test(await page.locator('.hero .eyebrow').textContent())) fail('should be week 2');
await page.locator('.home-action .btn-primary').click();
await choice(page, 'Good').click(); await choice(page, 'Nothing today').click();
await btn('Start warm-up').click(); await btn('Warm-up done').click();
await page.locator('.exercise h1').waitFor(); await snap('11-week2-ex1');
const target = await page.locator('.exercise .target').textContent();
const lastTime = await page.getByText(/^Last time:/).textContent().catch(() => '');
console.log(`week 2, exercise 1: "${await page.locator('.exercise h1').textContent()}" · ${target} · ${lastTime}`);
if (!lastTime) fail('week 2 should show last time');

// One set, then she closes the app; reopening resumes where she left off.
const wi = page.locator('.set.current .weight-input');
if ((await wi.count()) && !(await wi.inputValue())) await wi.fill('10');
await page.locator('.set.current').getByRole('button', { name: 'Done set' }).click();
await page.reload();
await page.getByText('This week’s workouts').waitFor();
const cont = page.locator('.home-action .btn-primary');
if (!/Continue Full body A/.test(await cont.textContent())) fail('should offer to continue');
await cont.click();
await page.locator('.exercise h1').waitFor({ timeout: 5000 }).catch(async (e) => { await snap('zz-fail'); console.error(errors.join('\n')); throw e; });
if ((await page.locator('.set.done').count()) !== 1) fail('resume should show the set already done');
await snap('12-resumed');
await btn('End workout').click();
await page.locator('.sheet').getByRole('button', { name: 'End workout' }).click();
await page.getByText('Saved. Nice work today!').waitFor();
db = await fakeDb(page);
const s2 = db.tables.session_logs[1];
console.log(`week 2: status=${s2?.status} sets=${db.tables.exercise_logs.filter((e) => e.session_log_id === s2?.id).map((e) => e.sets.length)}`);
if (s2?.status !== 'partial') fail('ended early with a set done should be partial');
if (db.tables.cycles.length !== 1) fail('still exactly one cycle');

await ctx.close(); await browser.close(); server.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
