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
