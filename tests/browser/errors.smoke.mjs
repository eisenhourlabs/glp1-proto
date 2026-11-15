// Browser smoke test for backlog A14 (error capture): a thrown error and an unhandled rejection in the patient app and on
// the join page are posted once each to the client-error function, cleaned (no email, no query string, no ids), counted
// at most 5 per page, and not sent while offline. The function is stood in for by a route that records what it receives.
//   node tests/browser/errors.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, signIn } from './harness.mjs';
import { APP_VERSION } from '../../web/config.js';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();
const home = content.setups.find((s) => s.setup === 'home_gym');
const patient = { status: 'active', experience: 'none', age_band: '50-59', setup: 'home_gym', equipment: home.equipment.filter((e) => e !== 'none'),
  days_per_week: 3, session_minutes: 45, goal: 'keep_muscle', start_date: '2026-11-02' };

async function capture(ctx) {
  const got = [];
  await ctx.route('**/functions/v1/client-error', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' } });
    got.push({ body: JSON.parse(req.postData() || '{}'), headers: req.headers() });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"result":"stored"}' });
  });
  return got;
}
// An inline <script> that throws reaches window.onerror like any uncaught error (a throw inside a timer would be caught by
// Playwright's fake clock instead). A rejection is simply left unhandled.
const throwLater = (page, js) => page.evaluate((code) => {
  if (code.startsWith('Promise.reject')) { new Function(code)(); return; }
  const s = document.createElement('script'); s.textContent = code; document.head.append(s); s.remove();
}, js);

// ── the patient app ──
const { ctx, page, snap, errors } = await openApp(browser, 'errors', seed(content, patient), { shots, time: '2026-11-02T09:00:00' });
const got = await capture(ctx);
await signIn(page);
await page.getByText('This week’s workouts').waitFor();

await throwLater(page, "throw new Error('boom for dana@example.com id 123456789 in 7f3c2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6')");
await page.waitForTimeout(400);
await throwLater(page, "Promise.reject(new RangeError('rejected on purpose'))");
await page.waitForTimeout(400);
if (got.length !== 2) fail(`expected 2 reports, got ${got.length}`);
const [a, b] = got.map((g) => g.body);
if (a) {
  if (a.app !== 'patient' || a.role !== 'patient') fail(`app/role: ${a.app}/${a.role}`);
  if (a.message !== 'Error: boom for [email] id [n] in [id]') fail(`message not cleaned: ${a.message}`);
  if (a.version !== APP_VERSION) fail(`version ${a.version}`);
  if (a.path !== '/') fail(`path ${a.path}`);
  if (/dana@|\?/.test(JSON.stringify(a))) fail('report still holds an email or a query string');
  if (Object.keys(a).sort().join() !== 'app,message,path,role,stack,version') fail(`unexpected fields: ${Object.keys(a)}`);
}
if (b && !/^RangeError: rejected on purpose/.test(b.message)) fail(`rejection message: ${b?.message}`);
if (got[0] && !/apikey/i.test(Object.keys(got[0].headers).join())) fail('the publishable key header is missing');

// The same error again is not sent twice; a stuck page stops after 5 distinct errors.
await throwLater(page, "throw new Error('boom for dana@example.com id 123456789 in 7f3c2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6')");
for (let i = 0; i < 8; i++) await throwLater(page, `throw new Error('distinct ${'x'.repeat(i + 1)}')`);
await page.waitForTimeout(600);
if (got.length !== 5) fail(`a page is capped at 5 reports; got ${got.length}`);

// Noise is not reported, and nothing is sent offline.
const before = got.length;
await ctx.setOffline(true);
await throwLater(page, "throw new Error('offline error')");
await page.waitForTimeout(300);
await ctx.setOffline(false);
if (got.length !== before) fail('an error was reported while offline');
await snap('01-after');

// ── the join page (no sign-in): the role is empty ──
const j = await openApp(browser, 'errors-join', seed(content, patient), { shots });
const gotJ = await capture(j.ctx);
await j.page.goto('http://localhost:8766/join.html?code=LAKESIDE');
await j.page.locator('h1').first().waitFor();
await throwLater(j.page, "throw new TypeError('join page broke')");
await j.page.waitForTimeout(400);
if (gotJ.length !== 1) fail(`join page: expected 1 report, got ${gotJ.length}`);
else {
  const r = gotJ[0].body;
  if (r.app !== 'join' || r.role !== null) fail(`join report: ${r.app}/${r.role}`);
  if (r.path !== '/join.html') fail(`join path ${r.path} (the ?code= must not be sent)`);
}
await ctx.close(); await j.ctx.close();

// The errors this test throws on purpose are expected; anything else is a failure.
const real = [...errors, ...j.errors].filter((e) => !/boom|rejected on purpose|distinct|offline error|join page broke|Failed to load resource/.test(e));
if (real.length) fail(real.join('\n'));
await browser.close(); server.close();
console.log(`reports: ${got.length} patient, ${gotJ.length} join`);
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
