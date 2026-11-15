import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAll, runPersona, weekScript } from '../scripts/speedrun/run.mjs';
import { lineChecks, sessionChecks, weekChecks, seriesChecks, reviewChecks } from '../scripts/speedrun/checks.mjs';
import { indexMd, personaMd, resultsJson } from '../scripts/speedrun/report.mjs';
import { compareMd, planChanges } from '../scripts/speedrun/compare.mjs';
import { loadPersonas, insideRepo } from '../scripts/speedrun.mjs';
import { speedrunContent } from './fixtures/speedrun_content.js';

const content = speedrunContent();
const personas = loadPersonas(fileURLToPath(new URL('../scripts/speedrun/personas.example.json', import.meta.url)));

test('example personas: 11 personas × 30 weeks, zero Framework violations, well under a minute', () => {
  assert.equal(personas.length, 11);
  const t0 = performance.now();
  const { results } = runAll(personas, content, { weeks: 30 });
  assert.ok(performance.now() - t0 < 60000);
  for (const r of results) {
    assert.deepEqual(r.violations, [], `${r.persona.key}: ${JSON.stringify(r.violations.slice(0, 3))}`);
    assert.ok(r.cycles.length >= 3, `${r.persona.key} reaches cycle 3`);
    assert.ok(r.final.workouts > 0);
  }
});

test('deterministic: the same inputs give the same results', () => {
  const a = resultsJson(runAll(personas.slice(0, 3), content, { weeks: 12 }).results, {});
  const b = resultsJson(runAll(personas.slice(0, 3), content, { weeks: 12 }).results, {});
  assert.equal(a, b);
});

test('gaps: a missed week is a welcome back, five weeks away is a restart, waiting on the review is neither', () => {
  const lisa = runPersona(personas.find((p) => p.key === 'lisa'), content, { weeks: 20 });
  const modes = lisa.weeks.flatMap((w) => (w.sessions || []).map((s) => [w.g, s.comeback]));
  assert.ok(modes.some(([g, m]) => g === 6 && m === 'welcome_back'));
  assert.ok(modes.some(([g, m]) => g === 19 && m === 'restart'));
  const tanya = runPersona(personas.find((p) => p.key === 'tanya'), content, { weeks: 13 });
  assert.ok(tanya.weeks.some((w) => w.waiting), 'weeks 10–11 wait for the review');
  const firstOfCycle2 = tanya.weeks.find((w) => w.cycle === 2 && w.sessions?.length).sessions[0];
  assert.equal(firstOfCycle2.comeback, 'none');
});

test('B7: five weeks away mid-cycle restarts the same cycle type at week 1 with the same exercises', () => {
  const lisa = runPersona(personas.find((p) => p.key === 'lisa'), content, { weeks: 20 });
  const restart = lisa.cycles.find((c) => c.restart);
  assert.ok(restart, 'a restart cycle');
  const before = lisa.cycles[lisa.cycles.indexOf(restart) - 1];
  assert.equal(restart.type, before.type);
  assert.equal(before.review, undefined, 'no review for the abandoned cycle');
  assert.equal(restart.template.id, before.template.id, 'same template; the exercises carry over (with any accepted level-ups)');
  const first = lisa.weeks.find((w) => w.cycle === restart.no && w.sessions?.length);
  assert.equal(first.cw, 1);
});

test('B7: 14–27 days away gives two lighter sessions; a pain report is a standing work-around until "Feeling better"', () => {
  const maria = runPersona(personas.find((p) => p.key === 'maria'), content, { weeks: 30 });
  const s = maria.weeks.flatMap((w) => w.sessions || []).filter((x) => x.comeback === 'reentry');
  assert.deepEqual(s.map((x) => x.second), [false, true]);
  const beth = runPersona(personas.find((p) => p.key === 'beth'), content, { weeks: 8 });
  const byWeek = (g) => beth.weeks.find((w) => w.g === g).sessions;
  assert.deepEqual(byWeek(4)[0].standing, ['knees'], 'after the week-3 pain report');
  assert.deepEqual(byWeek(6)[0].standing, [], 'Feeling better in week 6');
  assert.ok(byWeek(5).every((x) => x.lines.every((l) => (l.exercise.area_load?.knees ?? 0) <= 1)));
});

test('B6: offers from week 4, accepted ones apply, "Not yet" waits 2 weeks', () => {
  const dana = runPersona(personas.find((p) => p.key === 'dana'), content, { weeks: 9 });
  assert.ok(dana.levelUps.length > 0);
  assert.ok(dana.levelUps.every((u) => u.week >= 4));
  assert.equal(dana.levelUps[0].week, 4, 'Dana gets her first offer in week 4');
  assert.ok(dana.levelUps.every((u) => u.outcome === 'accepted'));
  const mike = runPersona(personas.find((p) => p.key === 'mike'), content, { weeks: 30 });
  assert.ok(mike.levelUps.length > 0 && mike.levelUps.every((u) => u.outcome === 'declined'));
  assert.deepEqual(mike.violations, []);
});

test('B9: two lighter weeks a cycle at most, each 7 days at the lighter dose; the short version is two main lifts + a finisher', () => {
  const nora = runPersona(personas.find((p) => p.key === 'nora'), content, { weeks: 9 });
  const taps = nora.weeks.flatMap((w) => (w.sessions || []).filter((s) => s.roughWeek)).map((s) => s.roughWeek);
  assert.deepEqual(taps, ['switched', 'switched', 'not offered']);
  const lighter = nora.weeks.flatMap((w) => w.sessions || []).filter((s) => s.selfLighter);
  assert.ok(lighter.length >= 2 && lighter.every((s) => s.weekMode === 'lighter'));
  const short = nora.weeks.flatMap((w) => w.sessions || []).filter((s) => s.short);
  assert.equal(short.length, 2);
  for (const s of short) {
    assert.ok(s.lines.filter((l) => l.role === 'P').length <= 2 && s.lines.filter((l) => l.role === 'F').length <= 1);
    assert.ok(!s.lines.some((l) => l.role === 'S' || l.role === 'O'));
  }
  assert.deepEqual(nora.violations, []);
});

test('equipment change applies from the next cycle', () => {
  const tanya = runPersona(personas.find((p) => p.key === 'tanya'), content, { weeks: 13 });
  assert.equal(tanya.cycles[0].setup, 'minimal_home');
  assert.equal(tanya.cycles[1].setup, 'commercial_gym');
  assert.ok(tanya.notes.some((n) => n.week === 8));
});

test('reviews run the validator and move to the next cycle type', () => {
  const dana = runPersona(personas.find((p) => p.key === 'dana'), content, { weeks: 19 });
  assert.deepEqual(dana.cycles.map((c) => c.type), ['C1', 'C2', 'C3']);
  assert.deepEqual(dana.cycles[0].review.validation.errors, []);
});

test('weekScript: listed week, gap, default', () => {
  const p = { days: 3, weeks: { 2: [{ feel: 'too_hard' }], 3: [] } };
  assert.equal(weekScript(p, 1).length, 3);
  assert.equal(weekScript(p, 2).length, 1);
  assert.deepEqual(weekScript(p, 3), []);
  assert.deepEqual(weekScript({ days: 2, weeks: [[{}]] }, 1), [{}]);
});

// ── Each rule catches what it should ──
const exercise = (o = {}) => ({ id: 'SQ13', pattern: 'SQ', level: 3, equipment: 'db', load_type: 'dumbbell', floor: false,
  restrictions: [], area_load: { knees: 1 }, ...o });
const line = (o = {}) => ({ slot: 'P1', role: 'P', pattern: 'SQ', id: 'SQ13', sets: 2, rir: '2', weight: null, lastWeight: null, found: false,
  load_type: 'dumbbell', written: { sets_by_week: [2, 2, 3, 3, 3, 3, 3, 3], reps_by_week: Array(8).fill('8-12'), rir_by_week: Array(8).fill('2'), rest_sec: 90 },
  ...o, exercise: exercise(o.exercise) });
const ctx = (o = {}) => ({ cycle: { levels: { SQ: 3 }, equipment: ['db'], dumbbells: [] }, cw: 1, ageBand: '40-49', areas: [], settings: {},
  profile: { restrictions: [], workarounds: [], floorOk: false }, ...o });
const rules = (l, c) => lineChecks(l, c).map((x) => x.rule);

test('lineChecks: a clean line passes', () => assert.deepEqual(rules(line(), ctx()), []));
test('lineChecks: level, 70+ cap, restriction, floor, work-around, equipment', () => {
  assert.ok(rules(line(), ctx({ cycle: { levels: { SQ: 2 }, equipment: ['db'] } })).includes('level_above'));
  assert.ok(rules(line(), ctx({ ageBand: '70+' })).includes('cap_70'));
  assert.ok(rules(line({ exercise: { restrictions: ['heavy'] } }), ctx({ profile: { restrictions: ['heavy'], workarounds: [], floorOk: false } })).includes('restriction'));
  assert.ok(rules(line({ exercise: { floor: true } }), ctx({ cycle: { levels: { SQ: 2 }, equipment: ['db'] } })).includes('floor'));
  assert.ok(rules(line({ exercise: { area_load: { knees: 2 } } }), ctx({ areas: ['knees'] })).includes('workaround'));
  assert.ok(rules(line({ exercise: { equipment: 'bb' } }), ctx()).includes('equipment'));
});
test('lineChecks: reps in reserve, sets above the template, load jump', () => {
  assert.ok(rules(line({ rir: '1-2' }), ctx()).includes('rir'));
  assert.ok(rules(line({ sets: 3 }), ctx()).includes('sets_above'));
  assert.ok(rules(line({ lastWeight: 20, weight: 25 }), ctx()).includes('load_jump'), 'skipped 22.5');
  assert.deepEqual(rules(line({ lastWeight: 20, weight: 22.5 }), ctx()), []);
  assert.deepEqual(rules(line({ lastWeight: 10, weight: 15 }), ctx({ cycle: { levels: { SQ: 3 }, equipment: ['db'], dumbbells: [5, 10, 15] } })), [],
    'her own dumbbells have no step between');
});
test('sessionChecks: a long gap with no comeback', () => {
  assert.equal(sessionChecks({ gapDays: 10, comeback: 'none', settings: {} })[0].rule, 'comeback_missed');
  assert.deepEqual(sessionChecks({ gapDays: 10, comeback: 'welcome_back', settings: {} }), []);
});
test('weekChecks and seriesChecks: increments, level-1 repeats, too-easy weeks, band flips', () => {
  const l = (o) => ({ id: 'X', level: 2, action: 'hold', weight: 10, lastWeight: 10, load_type: 'dumbbell', ...o });
  const sess = (letter, lines, feel = 'right', o = {}) => ({ letter, lines, checkin: { feel }, scaled: false, comeback: 'none', ...o });
  const wk = { g: 1, cycle: 1, adjustments: [], sessions: [
    sess('A', [l({ action: 'increase', weight: 12 }), l({ id: 'L1', level: 1 })], 'too_easy'),
    sess('B', [l({ action: 'increase', weight: 15, lastWeight: 12 }), l({ id: 'L1', level: 1 })], 'too_easy'),
    sess('C', [l({ action: 'increase', weight: 17.5, lastWeight: 15 })], 'too_easy')] };
  const r = weekChecks(wk, {});
  assert.deepEqual(r.violations.map((x) => x.rule), ['increments']);
  assert.deepEqual(r.watch.map((x) => x.rule).sort(), ['level1_repeat', 'too_easy_no_extra_sets']);
  const band = (w) => sess('A', [l({ id: 'B1', load_type: 'band', weight: w })]);
  assert.equal(seriesChecks([{ g: 1, cycle: 1, sessions: [band(2), band(3), band(2)] }])[0].rule, 'band_flip');
  assert.deepEqual(seriesChecks([{ g: 1, cycle: 1, sessions: [band(2), band(3), band(3)] }]), []);
});
test('reviewChecks: validator errors, level steps and ceilings are violations', () => {
  assert.equal(reviewChecks({ errors: ['bad'], review: [] }, { cycle: 1 })[0].rule, 'review_invalid');
  const v = (changes, levels, ceilings) => reviewChecks({ errors: [], review: [] }, {}, { proposal: { level_changes: changes }, levels, ceilings }).map((x) => x.rule);
  assert.deepEqual(v([{ pattern: 'SQ', change: 1 }], { SQ: 2 }, { SQ: 3 }), []);
  assert.deepEqual(v([{ pattern: 'SQ', change: 1 }], { SQ: 3 }, { SQ: 3 }), ['level_ceiling']);
  assert.deepEqual(v([{ pattern: 'SQ', change: 2 }], { SQ: 1 }, { SQ: 4 }), ['level_step']);
});

test('B1 in the speed-run: consistent personas level up at reviews, never past a ceiling', () => {
  const { results } = runAll(personas, content, { weeks: 30 });
  const dana = results.find((r) => r.persona.key === 'dana');
  assert.ok(dana.cycles[0].review.level_changes.length > 0, 'Dana moves up after cycle 1');
  assert.ok(Object.values(dana.cycles[1].levels).some((l) => l > 1));
  const nora = results.find((r) => r.persona.key === 'nora');
  assert.ok(nora.cycles.every((c) => !c.review || c.review.level_changes.length === 0), 'mostly too hard: no level-ups');
  for (const r of results) for (const c of r.cycles) for (const [p, l] of Object.entries(c.levels)) {
    if (r.persona.age_band === '70+') assert.ok(l <= 2, `${r.persona.key} ${p} ${l}`);
  }
});

test('reports and compare', () => {
  const { results } = runAll(personas.slice(0, 2), content, { weeks: 10 });
  const meta = { weeks: 10, ms: 1, engine: 'test', content: 'synthetic' };
  assert.match(indexMd(results, meta), /Framework violations: 0/);
  assert.match(personaMd(results[0]), /## Cycle 1/);
  const before = JSON.parse(resultsJson(results, meta));
  const after = JSON.parse(resultsJson(results, meta));
  assert.match(compareMd(before, after), /No differences/);
  after.results[0].cycles[0].plan[0].items[0] = { ...after.results[0].cycles[0].plan[0].items[0], id: 'ZZ', name: 'Other', level: 1 };
  assert.equal(planChanges(before.results[0], after.results[0]).length, 1);
  assert.match(compareMd(before, after), /Other L1/);
});

test('reports may not be written inside the repo', () => {
  assert.equal(insideRepo(fileURLToPath(new URL('../out', import.meta.url))), true);
  assert.equal(insideRepo(join(tmpdir(), 'speedrun')), false);
});
