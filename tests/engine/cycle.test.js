import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekOfCycle, isConsistent, needsRest, adaptiveWeekMode, weekModeMessage, slotDose, nextInQueue,
  materializeCycle, chooseTemplate } from '../../web/engine/cycle.js';
import { LIBRARY, slot, GYM } from './fixtures.js';

test('weekOfCycle', () => {
  assert.equal(weekOfCycle('2026-11-02', '2026-11-01'), 0);
  assert.equal(weekOfCycle('2026-11-02', '2026-11-02'), 1);
  assert.equal(weekOfCycle('2026-11-02', '2026-11-08'), 1);
  assert.equal(weekOfCycle('2026-11-02', '2026-11-09'), 2);
  assert.equal(weekOfCycle('2026-11-02', '2026-12-28'), 9);
});

test('consistency and needs-rest signals', () => {
  assert.equal(isConsistent(9, 7), true);
  assert.equal(isConsistent(9, 6), false);
  assert.equal(isConsistent(0, 0), false);
  assert.deepEqual(needsRest({ tooHard: 2 }), ['too_hard']);
  assert.deepEqual(needsRest({ lowEnergy: 1, flags: 2, stalledPrimaries: 1 }), []);
  assert.deepEqual(needsRest({ tooHard: 1 }, { 'adaptive.too_hard_count': 1 }), ['too_hard'], 'settings override');
});

test('adaptive week 4 and 9 (Framework §7.2a, Troy Gate 1)', () => {
  const m = (week, completed, signals = {}) => adaptiveWeekMode({ week, planned: 9, completed, signals }).mode;
  assert.equal(m(4, 5), 'build', 'not consistent → keep building');
  assert.equal(m(4, 8), 'consolidate', 'consistent, fresh');
  assert.equal(m(4, 8, { tooHard: 2 }), 'lighter', 'consistent, needs rest');
  assert.equal(m(9, 5), 'normal');
  assert.equal(m(9, 8), 'light');
  assert.equal(m(9, 8, { lowEnergy: 3 }), 'deload');
  assert.equal(m(6, 8, { tooHard: 5 }), 'build', 'other weeks unaffected');
  assert.equal(m(4, 5, { tooHard: 5 }), 'build', 'inconsistent never gets the lighter week');
  assert.ok(weekModeMessage('lighter').length > 10);
  assert.equal(weekModeMessage('build'), '');
});

test('slotDose by week and mode', () => {
  const s = slot('SQ', { sets: [2, 2, 3, 3, 3, 3, 3, 4], reps: [...Array(4).fill('6-10'), ...Array(4).fill('10-15')] });
  assert.deepEqual(slotDose(s, 1).sets, 2);
  assert.deepEqual(slotDose(s, 5).reps, { lo: 10, hi: 15 });
  assert.deepEqual(slotDose(s, 9).sets, 4, 'week 9 starts from week 8');
  assert.equal(slotDose(s, 9, 'deload').sets, 2, '4 × 55% ≈ 2');
  assert.equal(slotDose(s, 9, 'deload').rir, '3-4');
  assert.equal(slotDose(s, 9, 'light').sets, 3);
  assert.equal(slotDose(s, 4, 'lighter').sets, 2);
  assert.equal(slotDose(s, 4, 'consolidate').sets, 3);
  assert.equal(slotDose(slot('SQ', { sets: Array(8).fill(1) }), 4, 'lighter').sets, 1, 'never below 1');
});

test('queue: next session, week done', () => {
  assert.equal(nextInQueue(['A', 'B', 'C'], []), 'A');
  assert.equal(nextInQueue(['A', 'B', 'C'], ['A', 'C']), 'B');
  assert.equal(nextInQueue(['A', 'B'], ['B', 'A']), null);
});

test('materializeCycle resolves each session, distinct exercises across the week, counts skips', () => {
  const template = { template_id: 'T', sessions: [{ session: 'A', name: 'A' }, { session: 'B', name: 'B' }] };
  const slots = [
    slot('SQ', { session: 'A', slot: 'P1', ord: 1 }), slot('HP', { session: 'A', slot: 'P2', ord: 2 }),
    slot('SQ', { session: 'B', slot: 'P1', ord: 1 }), slot('CA', { session: 'B', slot: 'F1', ord: 2, role: 'F' }),
  ];
  const c = materializeCycle(template, slots, { equipment: GYM, patternLevels: { SQ: 3, HP: 2 } }, LIBRARY, { minutes: 30 });
  assert.equal(c.sessions.length, 2);
  assert.notEqual(c.sessions[0].items[0].exercise.id, c.sessions[1].items[0].exercise.id);
  assert.equal(c.skipped, 1, 'no carry exercise in the fixture library');
});

test('materializeCycle steers away from last cycle\'s exercises when there is a choice', () => {
  const template = { template_id: 'T', sessions: [{ session: 'A', name: 'A' }] };
  const slots = [slot('SQ', { session: 'A', slot: 'P1', ord: 1 })];
  const profile = { equipment: GYM, patternLevels: { SQ: 3 } };
  const first = materializeCycle(template, slots, profile, LIBRARY).sessions[0].items[0].exercise.id;
  const fresh = materializeCycle(template, slots, profile, LIBRARY, { used: [first] }).sessions[0].items[0].exercise.id;
  assert.notEqual(fresh, first);
});

test('chooseTemplate: 4-day only for experienced; falls back to 3-day', () => {
  const T = [
    { template_id: 'C1-3D', cycle_type: 'C1', days_per_week: 3, active: true },
    { template_id: 'C1-2D', cycle_type: 'C1', days_per_week: 2, active: true },
    { template_id: 'C2-4D', cycle_type: 'C2', days_per_week: 4, active: true },
    { template_id: 'C2-3D', cycle_type: 'C2', days_per_week: 3, active: true },
  ];
  assert.equal(chooseTemplate(T, { cycleType: 'C1', daysPerWeek: 2 }).template_id, 'C1-2D');
  assert.equal(chooseTemplate(T, { cycleType: 'C2', daysPerWeek: 4, experienced: false }).template_id, 'C2-3D');
  assert.equal(chooseTemplate(T, { cycleType: 'C2', daysPerWeek: 4, experienced: true }).template_id, 'C2-4D');
  assert.equal(chooseTemplate(T, { cycleType: 'C1', daysPerWeek: 4, experienced: true }).template_id, 'C1-3D', 'no C1 4-day');
});

// ── B4: balance in at least 2 sessions a week at 60+ ──
import { withBalance } from '../../web/engine/cycle.js';
import { speedrunContent } from '../fixtures/speedrun_content.js';

test('withBalance: under 60 the slots are unchanged', () => {
  const c = speedrunContent();
  const t = c.templates.find((x) => x.template_id === 'C1-2D');
  assert.equal(withBalance(c.slots, t, { ageBand: '50-59', minutes: 30 }), c.slots);
});

test('withBalance: every template has ≥ 2 sessions with balance at 60+, at every length, including 2-day plans', () => {
  const c = speedrunContent();
  for (const t of c.templates) for (const minutes of [30, 45, 60]) for (const ageBand of ['60-69', '70+']) {
    const out = withBalance(c.slots, t, { ageBand, minutes });
    const withBa = t.sessions.filter(({ session }) => out.some((s) => s.template_id === t.template_id && s.session === session
      && s.pattern === 'BA' && s.min_minutes <= minutes)).length;
    assert.ok(withBa >= 2, `${t.template_id} ${minutes} min ${ageBand}: ${withBa}`);
    for (const { session } of t.sessions) {
      const ords = out.filter((s) => s.template_id === t.template_id && s.session === session).map((s) => s.ord);
      assert.equal(new Set(ords).size, ords.length, 'ords stay unique');
      assert.ok(ords.every(Number.isInteger));
    }
    const other = c.slots.filter((s) => s.template_id !== t.template_id);
    assert.deepEqual(out.filter((s) => s.template_id !== t.template_id), other, 'other templates untouched');
  }
});

test('withBalance: the added finisher sits after the last finisher, before optional slots', () => {
  const c = speedrunContent();
  const t = c.templates.find((x) => x.template_id === 'C1-2D');   // session B has balance, A has none
  const out = withBalance(c.slots, t, { ageBand: '60-69', minutes: 30 });
  const a = out.filter((s) => s.template_id === 'C1-2D' && s.session === 'A').sort((x, y) => x.ord - y.ord);
  assert.deepEqual(a.map((s) => s.slot), ['P1', 'P2', 'S1', 'S2', 'F1', 'BAL', 'O1']);
  assert.equal(a.find((s) => s.slot === 'BAL').pattern, 'BA');
  assert.equal(withBalance(c.slots, t, { ageBand: '60-69', minutes: 30, settings: { 'balance.min_sessions_60_plus': 1 } }), c.slots);
});

test('materializeCycle resolves the added balance slot for a 60+ profile', () => {
  const c = speedrunContent();
  const t = c.templates.find((x) => x.template_id === 'C1-2D');
  const profile = { equipment: ['chair', 'wall', 'band', 'db'], patternLevels: { BA: 1 } };
  const plan = materializeCycle(t, c.slots, profile, c.library, { minutes: 30, ageBand: '70+' });
  for (const s of plan.sessions) assert.ok(s.items.some((it) => it.slot.pattern === 'BA' && it.exercise), s.session);
});
