// Browser smoke test: a patient joins with her clinic's code (link and typed), with the error paths, and lands in
// onboarding signed in.   node tests/browser/join.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, fakeDb } from './harness.mjs';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();
const S = seed(content);
S.users.push({ id: 'ux', email: 'taken@example.com', password: 'pw123456' });
S.tables.clinic_codes = [{ code: 'LAKESIDE', clinic_id: 'c1', active: true }, { code: 'OLDCODE', clinic_id: 'c1', active: false }];

const { ctx, page, btn, snap, errors } = await openApp(browser, 'join', S, { shots });
// Sign-in page offers the join link
await page.goto('http://localhost:8766/');
await page.getByRole('link', { name: 'New here? Join with your clinic code' }).click();
await page.getByText('Enter the code from your clinic’s card').waitFor(); await snap('01-code');
await page.fill('input', 'oldcode'); await btn('Continue').click();
await page.getByText('That clinic code isn’t active').waitFor();
await page.fill('input', 'lakeside'); await btn('Continue').click();
await page.getByText('Create your account').waitFor(); await snap('02-form');
if (!(await page.getByText('Lakeside Weight & Wellness').count())) fail('clinic branding missing');

const inputs = page.locator('input');
await inputs.nth(0).fill('Maria'); await inputs.nth(1).fill('maria@example');
await inputs.nth(2).fill('password1'); await inputs.nth(3).fill('password2');
await btn('Create my account').click();
await page.getByText('Please enter a valid email address.').waitFor();
await inputs.nth(1).fill('maria@example.com');
await btn('Create my account').click();
await page.getByText('The two passwords don’t match.').waitFor();
await inputs.nth(3).fill('password1');
// An email that already has an account
await inputs.nth(1).fill('Taken@example.com');
await btn('Create my account').click();
await page.getByText('That email already has an account').waitFor();
await inputs.nth(1).fill('maria@example.com');
await btn('Create my account').click();
await page.getByText('Setting up takes about 5 minutes').waitFor(); await snap('03-onboarding');
if (!(await page.getByText('Welcome, Maria').count())) fail('should greet her by name');
const db = await fakeDb(page);
const prof = db.tables.profiles.find((p) => p.display_name === 'Maria');
if (prof?.clinic_id !== 'c1' || prof.role !== 'patient') fail('profile not under the clinic');
if (!db.tables.patients.some((p) => p.id === prof.id && p.status === 'onboarding')) fail('program row missing');

// Direct link with the code skips straight to the form
const two = await openApp(browser, 'join2', S, {});
await two.page.goto('http://localhost:8766/join.html?code=LAKESIDE');
await two.page.getByText('Create your account').waitFor();
errors.push(...two.errors);

await ctx.close(); await two.ctx.close(); await browser.close(); server.close();
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
