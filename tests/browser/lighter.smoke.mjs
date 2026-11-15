// Browser smoke test for sprint 1 PR 6 (B9, Amanda packet Q6, Q7, Q14):
//   "Rough week?" switches to the lighter version for 7 days (fewer sets, counts fully, logged); after two in a cycle
//   the link is replaced by a suggestion to talk with the clinic. The short version is the two main lifts and one
//   finisher. The goal reads "Keep my muscle".
//   node tests/browser/lighter.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, fakeDb, signIn } from './harness.mjs';
import { chooseTemplate, materializeCycle, slotDose } from '../../web/engine/cycle.js';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();
const home = content.setups.find((s) => s.setup === 'home_gym');
const levels = { SQ: 2, HI: 2, SL: 2, HP: 2, VP: 2, HR: 2, VR: 2, CA: 2, CO: 2, BA: 2, HA: 2, AR: 2 };
const patient = { status: 'active', experience: 'some', age_band: '50-59', setup: 'home_gym', equipment: home.equipment.filter((e) => e !== 'none'),
  dumbbells_available: [5, 8, 10, 12, 15, 20], days_per_week: 3, session_minutes: 45, goal: 'keep_muscle', start_date: '2026-10-12', pattern_levels: levels };
const template = chooseTemplate(content.templates, { cycleType: 'C1', daysPerWeek: 3, experienced: false });
const built = materializeCycle(template, content.slots, { equipment: patient.equipment, patternLevels: levels, workarounds: [], restrictions: [], floorOk: false },
  content.library, { minutes: 45 });
const items = built.sessions.flatMap((s) => s.items.map((it) => ({ cycle_id: 1, patient_id: 'u1', session: s.session, slot: it.slot.slot,
  ord: it.slot.ord, role: it.slot.role, pattern: it.slot.pattern, exercise_id: it.exercise?.id ?? null, reasons: it.reasons })));
const first = template.sessions[0].session;

function world(adjustments = []) {
  const S = seed(content, patient);
  S.tables.content_versions = [{ version: 1, is_current: true }];
  S.tables.cycles = [{ id: 1, patient_id: 'u1', cycle_no: 1, template_id: template.template_id, content_version: 1, cycle_type: 'C1', start_date: '2026-10-12',
    session_minutes: 45, status: 'active', week_modes: { 4: { mode: 'build' } } }];
  S.tables.cycle_items = structuredClone(items);
  S.tables.session_logs = [{ id: 801, patient_id: 'u1', cycle_id: 1, week: 3, session: first, log_date: '2026-10-30', status: 'done', feel: 'right',
    energy: 'ok', soreness: 'none', sore_areas: [], workaround_areas: [], scaled: false }];
  S.tables.adjustments = adjustments;
  return S;
}
const choice = (page, text) => page.locator('.choice', { hasText: text }).first();

// ── Rough week → lighter for 7 days ──
{
  const { ctx, page, btn, snap, errors } = await openApp(browser, 'lighter', world(), { shots, time: '2026-11-02T09:00:00' });
  await signIn(page);
  await page.getByText('This week’s workouts').waitFor();
  const goal = await page.locator('.hero .goal').textContent();
  if (!/Your goal: Keep my muscle$/.test(goal.trim())) fail(`goal label should be "Keep my muscle", got "${goal}"`);
  await page.locator('[data-rough-week]').click();
  const sheet = page.locator('.sheet');
  await sheet.getByText('Switch to the lighter version for the next 7 days').waitFor(); await snap('01-sheet');
  await sheet.getByRole('button', { name: 'Switch for 7 days' }).click();
  await page.locator('.hero [data-notice="week_mode"]').waitFor(); await snap('02-home');
  const notice = await page.locator('.hero [data-notice]').textContent();
  console.log(`notice: ${notice}`);
  if (!/lighter week runs through Sunday, November 8/.test(notice)) fail('notice should say the lighter week runs through Sunday, November 8');
  if (await page.locator('[data-rough-week]').count()) fail('no second switch while one is running');
  let db = await fakeDb(page);
  const a = db.tables.adjustments.find((x) => x.type === 'self_lighter_week');
  if (a?.detail.from !== '2026-11-02' || a?.detail.to !== '2026-11-08') fail(`lighter week not logged right: ${JSON.stringify(a?.detail)}`);

  await page.locator('.home-action .btn-primary').click();
  await choice(page, 'OK').click(); await choice(page, 'Nothing today').click();
  await btn('Start warm-up').click(); await btn('Warm-up done').click();
  const target = await page.locator('.exercise .target').textContent();
  const it0 = items.filter((i) => i.session === first && i.exercise_id).sort((x, y) => x.ord - y.ord)[0];
  const slot = content.slots.find((s) => s.template_id === template.template_id && s.session === first && s.slot === it0.slot);
  const want = slotDose(slot, 4, 'lighter').sets; const normal = slotDose(slot, 4, 'build').sets;
  console.log(`lighter: "${target}" (normal ${normal} sets, lighter ${want})`);
  if (!target.startsWith(`${want} set`)) fail(`lighter week should prescribe ${want} sets`);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  await ctx.close();
}

// ── Two used: talk with the clinic. Short version. ──
{
  const used = [{ id: 5, patient_id: 'u1', cycle_id: 1, type: 'self_lighter_week', reason: 'patient_choice', detail: { from: '2026-10-13', to: '2026-10-19' }, created_at: '2026-10-13T08:00:00Z' },
    { id: 6, patient_id: 'u1', cycle_id: 1, type: 'self_lighter_week', reason: 'patient_choice', detail: { from: '2026-10-20', to: '2026-10-26' }, created_at: '2026-10-20T08:00:00Z' }];
  const { ctx, page, btn, snap, errors } = await openApp(browser, 'short', world(used), { shots, time: '2026-11-02T09:00:00' });
  await signIn(page);
  await page.getByText('This week’s workouts').waitFor();
  const t = await page.locator('[data-rough-week]').textContent().catch(() => '');
  if (!/quick word with your clinic/.test(t)) fail('after two lighter weeks the copy should suggest the clinic');
  await page.locator('.home-action .btn-primary').click();
  await choice(page, 'OK').click(); await choice(page, 'Nothing today').click();
  await page.locator('[data-short] .choice').click(); await snap('03-short-readiness');
  await btn('Start warm-up').click(); await btn('Warm-up done').click();
  const eyebrow = await page.locator('.exercise .eyebrow').textContent();
  const n = Number((eyebrow.match(/of (\d+)/) || [])[1]);
  const roles = items.filter((i) => i.session === first && i.exercise_id);
  const expect = Math.min(2, roles.filter((i) => i.role === 'P').length) + (roles.some((i) => i.role === 'F') ? 1 : 0);
  console.log(`short: ${eyebrow} (expected ${expect} of ${roles.length})`);
  if (n !== expect) fail(`short version should have ${expect} exercises`);
  const db = await fakeDb(page);
  if (!db.tables.adjustments.some((a) => a.type === 'short_version' && a.detail.session_log_id === db.tables.session_logs.at(-1).id)) fail('short version not logged');
  await page.reload(); await page.getByText('This week’s workouts').waitFor();
  await page.locator('.home-action .btn-primary').click();   // Continue: still the short version
  await btn('Warm-up done').click();
  await page.locator('.exercise .eyebrow').waitFor();
  if (!new RegExp(`of ${expect}$`).test((await page.locator('.exercise .eyebrow').textContent()).trim())) fail('resuming keeps the short version');
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  await ctx.close();
}

await browser.close(); server.close();
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
