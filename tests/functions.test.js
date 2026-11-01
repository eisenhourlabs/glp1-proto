// Edge Function tests: the generated file is up to date, the bundled code runs, and the cycle-review handler behaves
// (auth, timing, AI on/off/failing/bad output, idempotence) against an in-memory database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, functionNames, outPath } from '../scripts/build_functions.mjs';
import { reviewCycle, cleanReflection } from '../supabase/functions_src/ai-cycle-review/handler.js';
import { LIBRARY } from './engine/fixtures.js';

test('generated Edge Functions are up to date (run node scripts/build_functions.mjs)', () => {
  for (const name of functionNames()) assert.equal(readFileSync(outPath(name), 'utf8'), build(name), `${name} is stale`);
});

test('the bundled code runs on its own', async () => {
  const text = readFileSync(outPath('ai-cycle-review'), 'utf8');
  const code = text.slice(text.indexOf('// ════ Engine and handler'), text.indexOf('// ════ end of generated code'));
  const mod = await import(`data:text/javascript,${encodeURIComponent(`${code}\nexport { reviewCycle, cleanReflection };`)}`);
  assert.equal(typeof mod.reviewCycle, 'function');
  assert.deepEqual(mod.cleanReflection({ days: 9, focus: 'x' }).days, null);
});

// ── a tiny in-memory stand-in for the service-role supabase client ──
function fakeDb(tables) {
  let next = 100;
  const q = (name) => {
    const filters = []; let op = 'select'; let payload; let one = null;
    const api = {
      select: () => api, eq: (c, v) => { filters.push((r) => r[c] === v); return api; },
      gte: (c, v) => { filters.push((r) => String(r[c]) >= String(v)); return api; },
      maybeSingle: () => { one = 'maybe'; return api; }, single: () => { one = 'single'; return api; },
      insert: (row) => { op = 'insert'; payload = row; return api; },
      then: (res, rej) => Promise.resolve().then(() => {
        const t = (tables[name] ??= []);
        let data;
        if (op === 'insert') { data = [{ id: next++, ...payload }]; t.push(data[0]); }
        else data = t.filter((r) => filters.every((f) => f(r)));
        if (one) data = data[0] ?? null;
        return { data: structuredClone(data), error: one === 'single' && !data ? { message: 'none' } : null };
      }).then(res, rej),
    };
    return api;
  };
  return { from: q };
}

const seed = (start = '2026-09-07') => ({
  profiles: [{ id: 'p1', role: 'patient' }, { id: 'adm', role: 'admin' }, { id: 'cv', role: 'clinic_viewer' }],
  patients: [{ id: 'p1', age_band: '50-59', experience: 'none', goal: 'keep_muscle', setup: 'commercial_gym', equipment: ['chair', 'wall', 'bench', 'db', 'band', 'm_legpress', 'm_chest', 'm_pulldown'],
    restrictions: [], workarounds: [], floor_ok: false, pattern_levels: { SQ: 2, HP: 2 }, days_per_week: 3 }],
  cycles: [{ id: 1, patient_id: 'p1', cycle_no: 1, cycle_type: 'C1', template_id: 'C1-3D', content_version: 1, start_date: start, session_minutes: 45, status: 'active', week_modes: {} }],
  content_exercises: LIBRARY.map((e) => ({ ...e, version: 1 })),
  content_templates: [{ version: 1, template_id: 'C1-3D', cycle_type: 'C1', days_per_week: 3 }],
  session_logs: [1, 2, 3, 4, 5, 6, 7, 8].flatMap((w) => ['A', 'B', 'C'].map((s, i) => ({ id: w * 10 + i, cycle_id: 1, patient_id: 'p1', week: w, session: s, status: 'done', log_date: '2026-09-07', feel: 'right' }))),
  exercise_logs: [], flags: [], adjustments: [], ai_proposals: [],
  app_settings: [{ key: 'ai.max_exercise_swaps', value: 3 }],
});
const deps = (tables, callModel, user = 'p1') => ({ db: fakeDb(tables), today: '2026-11-03', model: 'test-model',
  getUser: async (t) => (t === 'ok' ? { id: user } : null), callModel });
const good = { cycle_type: 'C2', days_per_week: 3, level_changes: [{ pattern: 'SQ', change: 1, evidence: 'Steady Good ratings all cycle.' }],
  swaps: [], recap: 'You trained 24 times this cycle. That consistency is building real strength.', focus: 'Stronger legs', flags: [] };
const reflection = { worked: ['short_workouts'], in_the_way: ['busy'], adjust: 'same', focus: 'Stairs without stopping', days: 3, minutes: 45, note: 'private note' };

test('auth and timing', async () => {
  assert.equal((await reviewCycle({ token: '', body: {} }, deps(seed(), async () => null))).status, 401);
  assert.equal((await reviewCycle({ token: 'ok', body: {} }, deps(seed(), async () => null, 'cv'))).status, 403, 'clinic viewer');
  const early = await reviewCycle({ token: 'ok', body: {} }, deps(seed('2026-10-20'), async () => null));
  assert.deepEqual([early.status, early.body.error], [400, 'too_early'], 'week 3');
  const admin = await reviewCycle({ token: 'ok', body: { patient_id: 'p1' } }, deps(seed('2026-10-20'), async () => null, 'adm'));
  assert.equal(admin.status, 200, 'an admin can run it any time');
});

test('no API key → the default plan, ready', async () => {
  const t = seed();
  const r = await reviewCycle({ token: 'ok', body: { reflection } }, deps(t, async () => null));
  const p = r.body.proposal;
  assert.deepEqual([p.source, p.status, p.ai_error, p.final.cycle_type, p.final.focus], ['default', 'ready', 'no_api_key', 'C2', 'Stairs without stopping']);
  assert.equal(p.reflection.note, 'private note', 'note kept for the team');
  assert.ok(!JSON.stringify(p.input_summary).includes('private note'), 'note never in the AI input');
  const again = await reviewCycle({ token: 'ok', body: {} }, deps(t, async () => { throw new Error('should not be called'); }));
  assert.equal(again.body.proposal.id, p.id, 'one review per cycle');
});

test('AI output: valid → ready with the AI plan; invalid → pending with the default meanwhile; failure → default', async () => {
  let seen;
  const ok = (await reviewCycle({ token: 'ok', body: { reflection } }, deps(seed(), async (prompt, tool) => { seen = { prompt, tool }; return good; }))).body.proposal;
  assert.deepEqual([ok.source, ok.status, ok.model, ok.final.level_changes.length], ['ai', 'ready', 'test-model', 1]);
  assert.equal(seen.tool.name, 'propose_next_cycle');
  assert.ok(!seen.prompt.user.includes('p1'), 'no patient id in the prompt');

  const bad = (await reviewCycle({ token: 'ok', body: { reflection } }, deps(seed(), async () => ({ ...good, cycle_type: 'C3', recap: 'Great weight loss!' })))).body.proposal;
  assert.equal(bad.status, 'pending');
  assert.equal(bad.final.cycle_type, 'C2', 'she gets the default until an admin decides');
  assert.ok(bad.validation.errors.length >= 2);

  const down = (await reviewCycle({ token: 'ok', body: { reflection } }, deps(seed(), async () => { throw new Error('anthropic 529'); }))).body.proposal;
  assert.deepEqual([down.source, down.status, down.ai_error], ['default', 'ready', 'anthropic 529']);

  const junk = (await reviewCycle({ token: 'ok', body: {} }, deps(seed(), async () => 'not an object'))).body.proposal;
  assert.equal(junk.status, 'pending');
});

test('cleanReflection keeps only known shapes', () => {
  const r = cleanReflection({ worked: ['a'.repeat(99)], days: '4', minutes: 50, focus: ` ${'f'.repeat(100)} `, note: 'n'.repeat(900) });
  assert.equal(r.worked[0].length, 40);
  assert.equal(r.days, 4);
  assert.equal(r.minutes, null);
  assert.equal(r.focus.length, 80);
  assert.equal(r.note.length, 500);
});
