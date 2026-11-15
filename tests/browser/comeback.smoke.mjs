// Browser smoke test for sprint 1 PR 5:
//   B6: in week 5, a bodyweight exercise at the end of its reps → tempo → pause ladder gets a level-up offer on the
//       reward screen; "Move up" raises the level and swaps the pattern's exercises for the rest of the cycle.
//   B7: back after 28+ days in week 9 with her last workout in week 3: the cycle restarts at week 1 (same exercises);
//       a knee pain report is a standing work-around (no knee-heavy exercise) until she taps "Feeling better".
//   node tests/browser/comeback.smoke.mjs <content.json> [screenshot-dir]
import { chromium, serve, loadContent, seed, openApp, fakeDb, signIn } from './harness.mjs';
import { chooseTemplate, materializeCycle } from '../../web/engine/cycle.js';
import { resolveSlot } from '../../web/engine/resolve.js';

const content = loadContent(process.argv[2]);
const shots = process.argv[3];
const server = serve(8766);
const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const browser = await chromium.launch();
const lib = Object.fromEntries(content.library.map((e) => [e.id, e]));
const gym = content.setups.find((s) => s.setup === 'commercial_gym');
const levels = { SQ: 1, HI: 1, SL: 1, HP: 1, VP: 1, HR: 1, VR: 1, CA: 1, CO: 1, BA: 1, HA: 1, AR: 1 };
const base = { status: 'active', experience: 'none', age_band: '40-49', setup: 'commercial_gym', equipment: gym.equipment.filter((e) => e !== 'none'),
  days_per_week: 3, session_minutes: 45, goal: 'keep_muscle', pattern_levels: levels };
const template = chooseTemplate(content.templates, { cycleType: 'C1', daysPerWeek: 3, experienced: false });
const profile = { equipment: base.equipment, patternLevels: levels, workarounds: [], restrictions: [], floorOk: false };
const itemsAt = (lv) => materializeCycle(template, content.slots, { ...profile, patternLevels: lv }, content.library, { minutes: 45 })
  .sessions.flatMap((s) => s.items.map((it) => ({ cycle_id: 1, patient_id: 'u1', session: s.session, slot: it.slot.slot,
    ord: it.slot.ord, role: it.slot.role, pattern: it.slot.pattern, exercise_id: it.exercise?.id ?? null, reasons: it.reasons })));
const items = itemsAt(levels);
const first = template.sessions[0].session;

function world(start, extra = {}) {
  const S = seed(content, { ...base, start_date: start, ...extra.patient });
  const its = extra.items || items;
  S.tables.content_versions = [{ version: 1, is_current: true }];
  S.tables.cycles = [{ id: 1, patient_id: 'u1', cycle_no: 1, template_id: template.template_id, content_version: 1, cycle_type: 'C1', start_date: start,
    session_minutes: 45, status: 'active', week_modes: { 4: { mode: 'build' }, 9: { mode: 'normal' } } }];
  S.tables.cycle_items = structuredClone(its);
  S.tables.session_logs = extra.logs || [];
  S.tables.exercise_logs = extra.exLogs || [];
  S.tables.flags = extra.flags || [];
  S.tables.adjustments = [];
  return S;
}
const log = (id, date, week, session = first) => ({ id, patient_id: 'u1', cycle_id: 1, week, session, log_date: date, status: 'done', feel: 'right',
  energy: 'ok', soreness: 'none', sore_areas: [], workaround_areas: [], scaled: false });
const choice = (page, text) => page.locator('.choice', { hasText: text }).first();
const visible = async (loc) => (await loc.count()) > 0 && loc.first().isVisible();

/** Do today's workout: the named exercise at the suggested reps rated Good, everything else skipped. Returns names seen. */
async function workout(page, btn, { keep = null } = {}) {
  await choice(page, 'OK').click(); await choice(page, 'Nothing today').click();
  await btn('Start warm-up').click(); await btn('Warm-up done').click();
  const seen = [];
  for (let guard = 0; guard < 200; guard++) {
    if (await visible(page.getByText('Last one done!'))) break;
    const h1 = page.locator('.exercise h1');
    if (!(await visible(h1))) { await page.waitForTimeout(50); continue; }
    const name = await h1.textContent();
    if (seen[seen.length - 1] !== name) seen.push(name);
    if (name !== keep) { await btn('Skip', { exact: true }).click(); continue; }
    const cur = page.locator('.set.current');
    if (await visible(cur)) { await cur.getByRole('button', { name: 'Done set' }).click(); continue; }
    const rate = page.locator('.card.soft', { hasText: 'How did that feel?' });
    if (await visible(rate)) { await choice(rate, 'Good').click(); continue; }
    await page.waitForTimeout(50);
  }
  await btn('Finish workout').click();
  await page.getByText('Quick check-in').waitFor();
  await choice(page, 'About right').click(); await choice(page, 'None').click();
  await btn('Save').click();
  return seen;
}

// ── B6: level-up offer in week 5 ──
{
  const slots = content.slots.filter((s) => s.template_id === template.template_id);
  const it = items.find((i) => i.session === first && ['P', 'S'].includes(i.role) && i.exercise_id && lib[i.exercise_id].load_type === 'bodyweight'
    && lib[i.exercise_id].measure !== 'time' && (() => {
      const slot = slots.find((s) => s.session === i.session && s.slot === i.slot);
      const up = resolveSlot(slot, { ...profile, patternLevels: { ...levels, [i.pattern]: 2 } }, content.library).exercise;
      return up && up.level > lib[i.exercise_id].level;
    })());
  if (!it) fail('no level-1 bodyweight primary with a level-2 option in session 1');
  else {
    const slot = slots.find((s) => s.session === it.session && s.slot === it.slot);
    const hi = Number(String(slot.reps_by_week[4]).split('-').pop());
    const ex = (id, sid, day, stage) => ({ id, session_log_id: sid, patient_id: 'u1', slot: it.slot, exercise_id: it.exercise_id, rating: 'good', skipped: false,
      sets: [{ reps: hi, stage }, { reps: hi, stage }], created_at: `2026-10-${day}T10:00:00Z` });
    const S = world('2026-10-05', { logs: [log(801, '2026-10-28', 4), log(802, '2026-10-30', 4)], exLogs: [ex(901, 801, 28, 1), ex(902, 802, 30, 2)] });
    const { ctx, page, btn, snap, errors } = await openApp(browser, 'offer', S, { shots, time: '2026-11-02T09:00:00' });
    await signIn(page);
    await page.getByText('This week’s workouts').waitFor();
    if (!/Week 5 of 9/.test(await page.locator('.hero .eyebrow').textContent())) fail('should be week 5');
    await page.locator('.home-action .btn-primary').click();
    await page.getByText('Energy today').waitFor();
    await workout(page, btn, { keep: lib[it.exercise_id].name });
    await page.getByText('Workout done!').waitFor();
    const card = page.locator('.offer');
    await card.waitFor({ timeout: 5000 }).catch(() => fail('no level-up offer on the reward screen (B6)'));
    await snap('01-offer');
    console.log(`offer: ${(await card.textContent().catch(() => '')).slice(0, 160)}`);
    if (await card.count()) {
      await card.getByRole('button', { name: 'Move up' }).click();
      await card.getByText('Done. Next time').waitFor();
      const db = await fakeDb(page);
      const p = db.tables.patients[0];
      const changed = db.tables.cycle_items.filter((i) => i.pattern === it.pattern && i.exercise_id !== it.exercise_id);
      const adj = db.tables.adjustments.find((a) => a.type === 'level_offer_accepted');
      console.log(`accepted: ${it.pattern} level ${p.pattern_levels[it.pattern]} · items changed ${changed.length} · ${JSON.stringify(adj?.detail)}`);
      if (p.pattern_levels[it.pattern] !== 2) fail('pattern level should be 2 after Move up');
      if (!changed.length || changed.some((i) => lib[i.exercise_id].level < 2)) fail('the pattern’s exercises should move to level 2');
      if (!adj) fail('accepted offer not logged');
    }
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    await ctx.close();
  }
}

// ── B7: restart after 28+ days ──
{
  const S = world('2026-09-07', { logs: [log(801, '2026-09-21', 3), log(802, '2026-09-23', 3)] });
  const { ctx, page, snap, errors } = await openApp(browser, 'restart', S, { shots, time: '2026-11-02T09:00:00' });
  await signIn(page);
  await page.getByText('This week’s workouts').waitFor(); await snap('02-restart');
  const eyebrow = await page.locator('.hero .eyebrow').textContent();
  const notice = await page.locator('.hero [data-notice]').textContent().catch(() => '');
  const db = await fakeDb(page);
  console.log(`restart: "${eyebrow}" · "${notice}" · cycles ${db.tables.cycles.map((c) => `${c.cycle_no}:${c.status}:${c.start_date}`).join(', ')}`);
  if (!/Week 1 of 9/.test(eyebrow)) fail('should restart at week 1');
  if (!/restarted this cycle/.test(notice)) fail('restart notice missing');
  const [old, fresh] = db.tables.cycles;
  if (old?.status !== 'abandoned' || fresh?.status !== 'active' || fresh.cycle_type !== 'C1' || fresh.template_id !== old.template_id) fail('old cycle closed, same cycle type restarted');
  const same = db.tables.cycle_items.filter((i) => i.cycle_id === fresh?.id).map((i) => `${i.session}${i.slot}${i.exercise_id}`).sort().join();
  if (same !== items.map((i) => `${i.session}${i.slot}${i.exercise_id}`).sort().join()) fail('restart keeps the same exercises');
  if (!db.tables.adjustments.some((a) => a.type === 'comeback_restart' && a.cycle_id === fresh?.id)) fail('restart not logged');
  await page.reload(); await page.getByText('This week’s workouts').waitFor();
  if ((await fakeDb(page)).tables.cycles.length !== 2) fail('a reload must not restart again');
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  await ctx.close();
}

// ── B7: standing work-around after a pain report (levels 3, so the plan has knee-heavy exercises) ──
{
  const lv3 = Object.fromEntries(Object.keys(levels).map((k) => [k, 3]));
  const items3 = itemsAt(lv3);
  const S = world('2026-10-19', { items: items3, patient: { pattern_levels: lv3 }, logs: [log(801, '2026-10-30', 2)],
    flags: [{ id: 1, patient_id: 'u1', type: 'pain', detail: { area: 'knees', session_log_id: 801 }, created_at: '2026-10-30T10:00:00Z' }] });
  const { ctx, page, btn, snap, errors } = await openApp(browser, 'standing', S, { shots, time: '2026-11-02T09:00:00' });
  await signIn(page);
  await page.getByText('This week’s workouts').waitFor();
  await page.locator('.home-action .btn-primary').click();
  const card = page.locator('[data-standing]');
  await card.waitFor({ timeout: 5000 }).catch(() => fail('readiness should list the standing work-around'));
  await snap('03-standing');
  const seen = await workout(page, btn);
  const heavy = seen.map((n) => content.library.find((e) => e.name === n)).filter((e) => e && (e.area_load?.knees ?? 0) > 1);
  const planned = items3.filter((i) => i.session === first && i.exercise_id && (lib[i.exercise_id].area_load?.knees ?? 0) > 1).length;
  console.log(`standing: ${seen.length} exercises, knee-heavy: ${heavy.map((e) => e.id).join(', ') || 'none'} (the plan has ${planned} knee-heavy)`);
  if (!planned) console.log('note: session 1 has no knee-heavy exercise, so the swap is not exercised');
  if (heavy.length) fail('a standing knee work-around should leave out knee-heavy exercises');
  await page.getByText(/Workout done|Saved/).first().waitFor();
  await btn('Back to home').click();
  await page.clock.setFixedTime(new Date('2026-11-04T09:00:00'));
  await page.reload(); await page.getByText('This week’s workouts').waitFor();
  await page.locator('.home-action .btn-primary').click();
  await page.locator('[data-standing]').getByRole('button', { name: 'Feeling better' }).click();
  await page.locator('[data-standing]').getByText('back to your usual exercises').waitFor();
  const db = await fakeDb(page);
  if (!db.tables.adjustments.some((a) => a.type === 'workaround_cleared' && a.detail.area === 'knees')) fail('Feeling better not saved');
  await btn('Back', { exact: true }).click();
  await page.locator('.home-action .btn-primary').click();
  await page.getByText('Energy today').waitFor();
  if (await page.locator('[data-standing]').count()) fail('after Feeling better the standing card is gone');
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  await ctx.close();
}

await browser.close(); server.close();
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE PASSED');
