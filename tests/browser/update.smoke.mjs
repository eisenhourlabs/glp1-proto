// Browser smoke test: safe app updates (backlog C5). A new version is deployed while she is in a workout: the code
// under the open workout doesn't change and nothing interrupts her; back on home she sees "Update ready", and one
// tap moves her to the new version.
//   node tests/browser/update.smoke.mjs <content.json> [screenshot-dir]
import { readFileSync } from 'node:fs';
import { chromium, serve, loadContent, seed, openApp, signIn, OVERRIDES } from './harness.mjs';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();

const OLD = readFileSync(new URL('../../web/version.js', import.meta.url), 'utf8').match(/'([^']+)'/)[1];
const NEW = `${OLD}-next`;
const home = content.setups.find((s) => s.setup === 'home_gym');
const S = seed(content, { status: 'active', experience: 'none', age_band: '50-59', setup: 'home_gym', equipment: home.equipment.filter((e) => e !== 'none'),
  dumbbells_available: [5, 8, 10, 12, 15, 20], days_per_week: 3, session_minutes: 45, goal: 'keep_muscle', start_date: '2026-11-02' });
const { ctx, page, btn, snap, errors } = await openApp(browser, 'update', S, { shots, time: '2026-11-02T09:00:00' });
const loadedVersion = () => page.evaluate(() => globalThis.GLP1PROTO_VERSION);
const swState = () => page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { active: !!r?.active, waiting: !!r?.waiting, controlled: !!navigator.serviceWorker.controller };
});

await signIn(page);
await page.getByText('This week’s workouts').waitFor();
await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active, null, { timeout: 15000 });
await page.reload();                                   // now the worker controls the page
await page.getByText('This week’s workouts').waitFor();
if (!(await swState()).controlled) fail('service worker should control the page');
if (await loadedVersion() !== OLD) fail(`version ${await loadedVersion()}, expected ${OLD}`);
if (!(await page.locator('.credit').textContent()).includes(OLD)) fail('footer shows the version');
if (await page.getByText('A new version of the app is ready.').count()) fail('no update yet');

// She starts a workout; meanwhile a new version is deployed.
await page.locator('.home-action .btn-primary').click();
await page.getByText('Energy today').waitFor();
OVERRIDES.set('/version.js', `globalThis.GLP1PROTO_VERSION = '${NEW}';\n`);
await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 15000 });
await snap('01-workout-during-deploy');
if (await page.getByText('A new version of the app is ready.').count()) fail('no update notice during a workout');
const served = await page.evaluate(async () => (await fetch('./version.js')).text());
if (!served.includes(OLD) || served.includes(NEW)) fail(`the open app must keep getting the old files, got: ${served.trim()}`);
if (await loadedVersion() !== OLD) fail('code changed under the workout');

// Back to home (reload): the new version is still waiting, and home offers it.
await page.reload();
await page.getByText('This week’s workouts').waitFor();
await page.getByText('A new version of the app is ready.').waitFor(); await snap('02-home-update-ready');
const st = await swState();
console.log(`after reload: version ${await loadedVersion()}, waiting=${st.waiting}`);
if (await loadedVersion() !== OLD || !st.waiting) fail('the update must wait for her tap');
if (await page.locator('.hero [data-notice]').count() > 1) fail('update card must not add a hero notice');

await Promise.all([page.waitForEvent('load'), btn('Update now').click()]);
await page.getByText('This week’s workouts').waitFor(); await snap('03-updated');
console.log(`after tap: version ${await loadedVersion()}`);
if (await loadedVersion() !== NEW) fail(`should be on ${NEW} after the tap`);
if (await page.getByText('A new version of the app is ready.').count()) fail('notice gone after updating');
const caches = await page.evaluate(() => caches.keys());
if (caches.some((k) => !k.startsWith('glp1proto-')) || caches.includes(`glp1proto-${OLD}`)) fail(`old cache not cleaned up: ${caches}`);

OVERRIDES.clear();
await ctx.close(); await browser.close(); server.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
