// Browser smoke test: the week-9 cycle review → next cycle. (A) with a canned AI plan (level up + swap), started in
// week 10; (B) with the review function unreachable, so the app's own standard plan is used.
//   node tests/browser/review.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, fakeDb, signIn } from './harness.mjs';
import { materializeCycle, chooseTemplate } from '../../web/engine/cycle.js';
import { startingLevels } from '../../web/engine/levels.js';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();
const START = '2026-09-07';

function buildSeed({ ai }) {
  const home = content.setups.find((s) => s.setup === 'commercial_gym');
  const patient = { status: 'active', experience: 'some', age_band: '50-59', setup: 'commercial_gym', equipment: home.equipment.filter((e) => e !== 'none'),
    days_per_week: 3, session_minutes: 45, goal: 'keep_muscle', start_date: START, pattern_levels: startingLevels({ experience: 'some' }) };
  const S = seed(content, patient);
  const template = chooseTemplate(content.templates, { cycleType: 'C1', daysPerWeek: 3, experienced: false });
  const profile = { equipment: patient.equipment, patternLevels: patient.pattern_levels, workarounds: [], restrictions: [], floorOk: false };
  const built = materializeCycle(template, content.slots.filter((s) => s.template_id === template.template_id), profile, content.library, { minutes: 45 });
  S.tables.content_versions = [{ version: 1, is_current: true }];
  S.tables.cycles = [{ id: 1, patient_id: 'u1', cycle_no: 1, template_id: template.template_id, content_version: 1, cycle_type: 'C1', start_date: START, session_minutes: 45, status: 'active', week_modes: {} }];
  S.tables.cycle_items = built.sessions.flatMap((s) => s.items.map((it) => ({ cycle_id: 1, patient_id: 'u1', session: s.session, slot: it.slot.slot, ord: it.slot.ord,
    role: it.slot.role, pattern: it.slot.pattern, exercise_id: it.exercise?.id ?? null, reasons: it.reasons })));
  const day = (n) => new Date(Date.parse(`${START}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  S.tables.session_logs = []; S.tables.exercise_logs = [];
  const sq = S.tables.cycle_items.find((i) => i.pattern === 'SQ' && i.exercise_id);
  for (let w = 1; w <= 8; w++) ['A', 'B', 'C'].forEach((s, k) => {
    const id = w * 10 + k;
    S.tables.session_logs.push({ id, patient_id: 'u1', cycle_id: 1, week: w, session: s, log_date: day((w - 1) * 7 + k * 2), status: 'done', feel: 'right', energy: 'ok', soreness: 'none', sore_areas: [], workaround_areas: [], scaled: false });
    if (s === 'A') S.tables.exercise_logs.push({ id: 500 + w, session_log_id: id, patient_id: 'u1', slot: sq.slot, exercise_id: sq.exercise_id, sets: [{ reps: 10 + Math.min(w, 4) }], rating: 'good', skipped: false, created_at: `${day((w - 1) * 7)}T10:00:00Z` });
  });
  const swap = content.library.find((e) => e.pattern === 'HR' && e.level <= 2 && e.active && !S.tables.cycle_items.some((i) => i.exercise_id === e.id) && e.equipment.split(';').every((g) => g.split('|').some((x) => x === 'none' || patient.equipment.includes(x))));
  if (ai) S.aiReview = { final: { cycle_type: 'C2', days_per_week: 3, level_changes: [{ pattern: 'SQ', change: 1, evidence: 'Reps climbed every week with Good ratings.' }],
    swaps: swap ? [{ pattern: 'HR', exercise_id: swap.id, reason: 'fresh' }] : [], recap: 'Twenty-four workouts and a steady climb in your squats. You built the habit.', focus: 'Stronger legs for stairs and getting up', flags: [] } };
  return { S, swap };
}

async function run(name, { ai }) {
  const { S, swap } = buildSeed({ ai });
  const { ctx, page, btn, snap, errors } = await openApp(browser, name, S, { shots, time: '2026-11-03T09:00:00' });   // week 9
  const choice = (t) => page.locator('.choice', { hasText: t }).first();
  await signIn(page);
  await page.getByText('Week 9: time for your cycle review').waitFor(); await snap('01-week9-home');
  await btn('Your cycle review').click();
  await page.getByText('Your Cycle 1 review').waitFor(); await snap('02-celebrate');
  await btn('Let’s plan the next one').click();
  await choice('Short workouts').click(); await choice('Busy weeks').click(); await choice('A bit more challenge').click(); await snap('03-reflect');
  await btn('Continue').click();
  await btn('Plan my next cycle').click();
  await page.getByText('Pick a focus first.').waitFor();
  await choice('Stronger legs for stairs').click(); await page.fill('textarea', 'Knees felt great by week 6');
  await btn('Plan my next cycle').click();
  await page.getByText('Cycle 2: Building').waitFor(); await snap('04-plan-week9');
  const txt = await page.locator('.step').textContent();
  if (ai && !/squat: one level up/.test(txt)) fail(`${name}: level change not shown`);
  if (ai && swap && !txt.includes(swap.name)) fail(`${name}: swap not shown`);
  if (!ai && !/24 workouts in Cycle 1/.test(txt)) fail(`${name}: standard recap missing`);
  if (await btn('Start Cycle 2').count()) fail(`${name}: start offered before week 9 is done`);
  if (!/You can start once this week’s workouts are done/.test(txt)) fail(`${name}: start-later note missing`);

  await page.clock.setFixedTime(new Date('2026-11-10T09:00:00'));                                  // week 10
  await page.reload();
  const main = page.locator('.home-action .btn-primary');
  await main.waitFor();
  console.log(`${name}: week 10 action = "${await main.textContent()}"`);
  await main.click();
  if (!ai) {   // no saved review → the review runs again (still unreachable) → standard plan
    await page.getByText('Your Cycle 1 review').waitFor(); await btn('Let’s plan the next one').click(); await btn('Continue').click();
    await choice('Showing up every week').click(); await btn('Plan my next cycle').click();
  }
  await page.getByText('Cycle 2: Building').waitFor();
  await choice('4').click(); await snap('05-plan-week10');
  await btn('Start Cycle 2').click();
  await page.getByText('This week’s workouts').waitFor(); await snap('06-cycle2-home');
  const eyebrow = await page.locator('.hero .eyebrow').textContent();
  const db = await fakeDb(page);
  const c2 = db.tables.cycles.find((c) => c.cycle_no === 2);
  const p = db.tables.patients[0];
  console.log(`${name}: ${eyebrow} · cycles ${db.tables.cycles.map((c) => `${c.cycle_no}:${c.cycle_type}:${c.status}`).join(' ')} · SQ ${p.pattern_levels.SQ} · days ${p.days_per_week}`);
  if (!/Building · 4 days · Week 1 of 9/.test(eyebrow)) fail(`${name}: should be on C2, 4 days, week 1`);
  if (db.tables.cycles.find((c) => c.cycle_no === 1).status !== 'done' || c2?.status !== 'active') fail(`${name}: cycle statuses`);
  if (ai && p.pattern_levels.SQ !== 3) fail(`${name}: SQ level should go 2 → 3`);
  if (!ai && p.pattern_levels.SQ !== 2) fail(`${name}: standard plan keeps levels`);
  if (ai && db.tables.ai_proposals[0].applied_cycle_id !== c2.id) fail(`${name}: proposal not linked to the new cycle`);
  if (ai && db.tables.ai_proposals[0].reflection.note !== 'Knees felt great by week 6') fail(`${name}: note not sent`);
  if (ai && swap && !db.tables.cycle_items.some((i) => i.cycle_id === c2.id && i.exercise_id === swap.id)) fail(`${name}: swap not applied`);
  if (db.tables.cycle_items.filter((i) => i.cycle_id === c2.id).length < 20) fail(`${name}: new cycle items`);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  await ctx.close();
}

await run('review-ai', { ai: true });
await run('review-default', { ai: false });
await browser.close(); server.close();
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
