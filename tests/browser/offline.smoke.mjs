// Browser smoke test: workouts that survive a bad signal (backlog C4). She opens the app once with a signal, then
// loses it: she starts a workout, logs a set, the app is closed and reopened (still offline), she resumes, raises the
// dizzy flag, finishes and checks in. Nothing reaches the database until the signal is back; then every row arrives
// exactly once. Also: a workout started with a signal and finished without one.
//   node tests/browser/offline.smoke.mjs <content.json> [screenshot-dir]
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
  days_per_week: 3, session_minutes: 30, goal: 'keep_muscle', start_date: '2026-11-02',
};
const { ctx, page, btn, snap, errors } = await openApp(browser, 'offline', seed(content, patient), { shots, time: '2026-11-02T09:00:00' });
const choice = (scope, text) => scope.locator('.choice', { hasText: text }).first();
const visible = async (loc) => (await loc.count()) > 0 && loc.first().isVisible();
const homeReady = () => page.getByText('This week’s workouts').waitFor();
const note = page.locator('.sync-note');

// With a signal: open the app, let the service worker take over (so the app itself loads offline), and save reads.
await signIn(page);
await homeReady();
await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 15000 });
for (let k = 0; k < 3 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)); k++) { await page.reload(); await homeReady(); }
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) fail('service worker should control the page');
await page.waitForTimeout(300);                      // saved copies of the reads are written in the background
const writesBefore = (await fakeDb(page)).writes?.length ?? 0;

// No signal from here.
await ctx.setOffline(true);
await note.getByText('You’re offline').waitFor(); await snap('01-offline-home');
await page.locator('.home-action .btn-primary').click();
await page.getByText('Energy today').waitFor();
await choice(page, 'Good').click(); await choice(page, 'Nothing today').click();
await btn('Start warm-up').click(); await btn('Warm-up done').click();
await page.locator('.exercise h1').waitFor();

async function doSet() {
  const cur = page.locator('.set.current');
  const wi = cur.locator('.weight-input');
  if ((await wi.count()) && !(await wi.inputValue())) await wi.fill('10');
  await cur.getByRole('button', { name: 'Done set' }).click();
}
await doSet();
await page.locator('.set.done').first().waitFor();

// The app is closed and opened again, still with no signal: it loads and offers to continue.
await page.reload();
await homeReady(); await snap('02-reopened-offline');
const cont = page.locator('.home-action .btn-primary');
if (!/Continue/.test(await cont.textContent())) fail('reopened offline: should offer to continue the workout');
await note.getByText('Saved on this phone').waitFor({ timeout: 3000 }).catch(() => fail('should say the workout is saved on this phone'));
await cont.click();
await page.locator('.exercise h1').waitFor();
if ((await page.locator('.set.done').count()) !== 1) fail('resume offline should show the set already done');

let guard = 0; let dizzy = false;
while (guard++ < 400) {
  if (await visible(page.getByText('Last one done!'))) break;
  const eyebrow = await page.locator('.exercise .eyebrow').textContent().catch(() => '');
  const n = Number((eyebrow.match(/Exercise (\d+)/) || [])[1] || 0);
  if (n === 2 && !dizzy) {
    dizzy = true;
    await btn('I feel dizzy or unwell').click();
    await page.getByText('The program team will be told as soon as your phone is back online').waitFor(); await snap('03-dizzy-offline');
    await btn('I feel OK now. Keep going').click();
    continue;
  }
  if (await visible(page.locator('.set.current'))) { await doSet(); continue; }
  const findCard = page.locator('.card.soft', { hasText: 'How was that weight?' });
  if (await visible(findCard)) { await choice(findCard, 'Good').click(); continue; }
  const rateCard = page.locator('.card.soft', { hasText: 'How did that feel?' });
  if (await visible(rateCard)) { await choice(rateCard, 'Good').click(); continue; }
  await page.waitForTimeout(50);
}
await btn('Finish workout').click();
await page.getByText('Quick check-in').waitFor();
await choice(page, 'About right').click(); await choice(page, 'Some').click(); await choice(page, 'Knees').click();
await btn('Save').click();
await page.getByText('Workout done!').waitFor(); await snap('04-reward-offline');
await btn('Back to home').click();
await page.getByText('Done for today').waitFor({ timeout: 8000 }).catch(async (e) => { await snap('zz-home'); console.error(errors.join('\n')); throw e; });
await snap('05-home-done-offline');

let db = await fakeDb(page);
if ((db.writes?.length ?? 0) !== writesBefore) fail('nothing should reach the database while offline');
const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('glp1proto.outbox.u1') || '{}').ops?.length ?? 0);
console.log(`offline: ${queued} writes waiting on the phone`);
if (queued < 5) fail('the workout should be queued on the phone');

// Signal back: everything arrives, once.
await ctx.setOffline(false);
await page.waitForFunction(() => (JSON.parse(localStorage.getItem('glp1proto.outbox.u1') || '{}').ops ?? []).length === 0, null, { timeout: 10000 });
await note.waitFor({ state: 'hidden' });
db = await fakeDb(page);
const logs = db.tables.session_logs || [];
const s1 = logs.find((l) => l.session === 'A');
const ex = (db.tables.exercise_logs || []).filter((e) => e.session_log_id === s1?.id);
const slots = ex.map((e) => e.slot);
console.log(`synced: sessions=${logs.length} status=${s1?.status} feel=${s1?.feel} soreness=${s1?.soreness} sore=${s1?.sore_areas} ` +
  `exercises=${ex.length} flags=${(db.tables.flags || []).map((f) => `${f.type}@${f.detail?.session_log_id}`)}`);
if (logs.length !== 1) fail(`exactly one workout row, got ${logs.length}`);
if (s1?.status !== 'done' || s1.feel !== 'right' || s1.soreness !== 'some' || s1.sore_areas?.[0] !== 'knees') fail('workout and check-in not synced');
if (!s1?.client_ref) fail('workout should carry its client_ref');
if (!ex.length || new Set(slots).size !== slots.length) fail('each exercise once');
if (ex.some((e) => !e.skipped && (!e.sets.length || !e.rating))) fail('every exercise logged and rated');
const flags = db.tables.flags || [];
if (flags.length !== 1 || flags[0].type !== 'dizzy' || flags[0].detail.session_log_id !== s1.id) fail('one dizzy flag pointing at the synced workout');

// Sent twice (signal lost after the server saved it): replaying the same writes stores nothing new.
await page.evaluate(async () => {
  const { db: client } = await import('./shared/supa.js');
  const f = JSON.parse(sessionStorage.getItem('fake-db'));
  const s = f.tables.session_logs[0]; const fl = f.tables.flags[0];
  await client.from('session_logs').upsert({ ...s, id: undefined, status: 'in_progress' }, { onConflict: 'client_ref', ignoreDuplicates: true });
  await client.from('flags').upsert({ ...fl, id: undefined }, { onConflict: 'client_ref', ignoreDuplicates: true });
});
db = await fakeDb(page);
if (db.tables.session_logs.length !== 1 || db.tables.session_logs[0].status !== 'done' || db.tables.flags.length !== 1) fail('a resent write must not duplicate or overwrite');

// Back home with a signal: the server's rows, no leftovers on the phone.
await page.reload(); await page.getByText('Done for today').waitFor();
const left = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('glp1proto.outbox.u1') || '{}').mirror ?? {})
  .filter((k) => /^[sefa]:/.test(k)).length);
console.log(`phone copies left after a fresh read: ${left}`);

// Second day: started with a signal, the signal drops mid-workout, finished offline, synced later.
await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
await page.reload(); await homeReady();
await page.locator('.home-action .btn-primary').click();
await choice(page, 'Good').click(); await choice(page, 'Nothing today').click();
await btn('Start warm-up').click(); await btn('Warm-up done').click();
await page.locator('.exercise h1').waitFor();
await doSet();
await page.waitForTimeout(200);
const started = (await fakeDb(page)).tables.session_logs.find((l) => l.session !== 'A');
if (!started || started.status !== 'in_progress') fail('day 2 workout should be on the server while online');
await ctx.setOffline(true);
await btn('End workout').click();
await page.locator('.sheet').getByRole('button', { name: 'End workout' }).click();
await page.getByText('Quick check-in').waitFor();
await choice(page, 'About right').click(); await choice(page, 'None').click();
await btn('Save').click();
await page.getByText('Saved. Every part counts!').waitFor();
await ctx.setOffline(false);
await page.waitForFunction(() => (JSON.parse(localStorage.getItem('glp1proto.outbox.u1') || '{}').ops ?? []).length === 0, null, { timeout: 10000 });
db = await fakeDb(page);
const s2 = db.tables.session_logs.find((l) => l.id === started?.id);
console.log(`day 2: sessions=${db.tables.session_logs.length} status=${s2?.status} feel=${s2?.feel}`);
if (db.tables.session_logs.length !== 2 || s2?.status !== 'partial' || s2.feel !== 'right') fail('day 2 should sync as partial with its check-in');

await browser.close(); server.close();
// Chrome logs every request that fails while offline; those are the point of this test, not app errors.
const real = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e));
errors.length = 0; errors.push(...real);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
