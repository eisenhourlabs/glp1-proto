import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionOrder, baseItems, weekStatus, trainedOn, weekWindow, weekModeFor, workingSets, lastPerformance,
  weightLabel, lastTimeText, planSession, applyHold, swapOptions, sessionSummary } from '../../web/engine/session.js';
import { applySoreness } from '../../web/engine/readiness.js';
import { LIBRARY, slot, GYM } from './fixtures.js';

const lib = Object.fromEntries(LIBRARY.map((e) => [e.id, e]));
const TEMPLATE = { sessions: [{ session: 'A', name: 'A' }, { session: 'B', name: 'B' }, { session: 'C', name: 'C' }] };

test('sessionOrder and baseItems', () => {
  assert.deepEqual(sessionOrder(TEMPLATE), ['A', 'B', 'C']);
  const slots = [slot('SQ', { slot: 'P1', ord: 1 }), slot('HP', { slot: 'P2', ord: 2 }), slot('VR', { slot: 'S1', ord: 3, role: 'S' }),
    slot('HI', { slot: 'P1', session: 'B' })];
  const items = [
    { session: 'A', slot: 'P2', ord: 2, exercise_id: 'HP04', reasons: [] },
    { session: 'A', slot: 'P1', ord: 1, exercise_id: 'SQ06', reasons: [{ type: 'equipment' }] },
    { session: 'A', slot: 'S1', ord: 3, exercise_id: null, reasons: [{ type: 'no-option' }] },
    { session: 'B', slot: 'P1', ord: 1, exercise_id: 'HI05', reasons: [] },
  ];
  const out = baseItems(items, 'A', slots, LIBRARY);
  assert.deepEqual(out.map((i) => i.exercise.id), ['SQ06', 'HP04'], 'ordered, empty slot dropped, other session excluded');
  assert.equal(out[0].slot.pattern, 'SQ');
  assert.equal(out[0].reasons[0].type, 'equipment');
});

test('weekStatus: a queue; partial counts; in-progress and skipped do not', () => {
  const logs = [{ session: 'A', status: 'done' }, { session: 'B', status: 'in_progress' }, { session: 'C', status: 'skipped' }];
  assert.deepEqual(weekStatus(['A', 'B', 'C'], logs), { done: ['A'], next: 'B', complete: false });
  const all = [{ session: 'A', status: 'done' }, { session: 'B', status: 'partial' }, { session: 'C', status: 'done' }];
  assert.deepEqual(weekStatus(['A', 'B', 'C'], all), { done: ['A', 'B', 'C'], next: null, complete: true });
});

test('trainedOn and weekWindow', () => {
  const logs = [{ log_date: '2026-11-03', status: 'done' }, { log_date: '2026-11-04', status: 'in_progress' }];
  assert.equal(trainedOn(logs, '2026-11-03'), true);
  assert.equal(trainedOn(logs, '2026-11-04'), false);
  assert.deepEqual(weekWindow('2026-11-02', 1), { from: '2026-11-02', to: '2026-11-09' });
  assert.deepEqual(weekWindow('2026-11-02', 4), { from: '2026-11-23', to: '2026-11-30' });
});

test('weekModeFor: only weeks 4 and 9; stored decision wins; computed from the two prior weeks', () => {
  const cycle = { week_modes: {} };
  const done = (week, o = {}) => ({ week, status: 'done', feel: 'right', energy: 'ok', ...o });
  const consistent = [done(2), done(2), done(2), done(3), done(3)];
  assert.equal(weekModeFor({ week: 3, cycle, logs: [], daysPerWeek: 3 }).mode, 'build');
  assert.equal(weekModeFor({ week: 4, cycle, logs: [done(2)], daysPerWeek: 3 }).mode, 'build', 'not consistent');
  assert.equal(weekModeFor({ week: 4, cycle, logs: consistent, daysPerWeek: 3 }).mode, 'consolidate');
  const tired = [done(2, { feel: 'too_hard' }), done(2), done(2), done(3, { feel: 'too_hard' }), done(3)];
  const r = weekModeFor({ week: 4, cycle, logs: tired, daysPerWeek: 3 });
  assert.equal(r.mode, 'lighter');
  assert.equal(r.stored, false);
  assert.deepEqual(r.restReasons, ['too_hard']);
  assert.equal(weekModeFor({ week: 4, cycle, logs: consistent, daysPerWeek: 3, flagCount: 3 }).mode, 'lighter', 'flags count');
  const old = [done(1), done(1), done(1), done(3)];
  assert.equal(weekModeFor({ week: 4, cycle, logs: old, daysPerWeek: 3 }).mode, 'build', 'week 1 is outside the window');
  const saved = weekModeFor({ week: 4, cycle: { week_modes: { 4: { mode: 'lighter' } } }, logs: consistent, daysPerWeek: 3 });
  assert.equal(saved.mode, 'lighter');
  assert.equal(saved.stored, true);
  assert.equal(weekModeFor({ week: 9, cycle, logs: [done(7), done(7), done(8), done(8), done(8)], daysPerWeek: 3 }).mode, 'light');
});

test('workingSets keeps the sets at the final weight; lastPerformance reads newest first', () => {
  assert.deepEqual(workingSets([{ weight: 10, reps: 10 }, { weight: 12, reps: 11 }, { weight: 12, reps: 10 }], 'reps'),
    { weight: 12, sets: [{ reps: 11 }, { reps: 10 }] });
  assert.deepEqual(workingSets([{ seconds: 25 }, { seconds: 30 }], 'time'), { weight: null, sets: [{ reps: 25 }, { reps: 30 }] });
  assert.equal(workingSets([], 'reps'), null);
  const hist = [{ skipped: true, sets: [] }, { sets: [{ weight: 15, reps: 12 }], rating: 'good' }, { sets: [{ weight: 12, reps: 12 }], rating: 'hard' }];
  assert.deepEqual(lastPerformance(hist, 'reps'), { last: { weight: 15, sets: [{ reps: 12 }], rating: 'good' }, prevRating: 'hard' });
  assert.deepEqual(lastPerformance([], 'reps'), { last: null, prevRating: null });
});

test('weightLabel', () => {
  assert.equal(weightLabel('dumbbell', 12), '12 lb');
  assert.equal(weightLabel('band', 3), 'Medium band');
  assert.equal(weightLabel('bodyweight', null), '');
  assert.equal(weightLabel('machine', null), '');
});

const item = (pattern, id, o = {}) => ({ slot: slot(pattern, o), exercise: lib[id], reasons: [] });

test('planSession: first exposure, progression, week mode, comeback', () => {
  const base = { week: 2, cycleType: 'C1', ageBand: '50-59' };
  const [first] = planSession([item('SQ', 'SQ07')], base);
  assert.equal(first.suggestion.action, 'find');
  assert.equal(first.weight, null);
  assert.deepEqual(first.dose.sets, 2);
  assert.deepEqual(first.range, { lo: 10, hi: 12 });

  const hist = { SQ07: [{ sets: [{ weight: 15, reps: 12 }, { weight: 15, reps: 12 }], rating: 'good' }] };
  const [up] = planSession([item('SQ', 'SQ07')], { ...base, week: 5, history: hist });
  assert.equal(up.suggestion.action, 'increase');
  assert.equal(up.weight, 17.5);
  assert.equal(up.lastWeight, 15);
  assert.deepEqual(up.last.sets, [{ reps: 12 }, { reps: 12 }]);

  const [own] = planSession([item('SQ', 'SQ07')], { ...base, week: 5, history: hist, dumbbells: [10, 15, 20] });
  assert.equal(own.weight, 20, 'her own dumbbells');

  const [held] = planSession([item('SQ', 'SQ07')], { ...base, week: 4, weekMode: 'consolidate', history: hist });
  assert.equal(held.suggestion.action, 'hold');
  assert.equal(held.weight, 15);

  const [light] = planSession([item('SQ', 'SQ07')], { ...base, week: 9, weekMode: 'deload', history: hist });
  assert.equal(light.dose.sets, 2, '3 sets cut ~45%');

  const comeback = { mode: 'welcome_back', setDelta: -1, loadCutPct: 10 };
  const [back] = planSession([item('SQ', 'SQ07')], { ...base, week: 5, history: hist, comeback });
  assert.equal(back.dose.sets, 2);
  assert.ok(back.weight < 17.5);
  assert.match(back.suggestion.note, /Welcome back/);
});

test('planSession: bands, bodyweight and holds get their own first-time note', () => {
  const [band] = planSession([item('VP', 'VP01')], { week: 1, cycleType: 'C1' });
  assert.match(band.suggestion.note, /band/);
  const [bw] = planSession([item('SQ', 'SQ01')], { week: 1, cycleType: 'C1' });
  assert.match(bw.suggestion.note, /reps/);
  const plank = { ...lib.HP01, id: 'CO02', pattern: 'CO', measure: 'time' };
  const [hold] = planSession([{ slot: slot('CO', { time: '20-30' }), exercise: plank, reasons: [] }], { week: 1, cycleType: 'C1' });
  assert.equal(hold.measure, 'time');
  assert.deepEqual(hold.range, { lo: 20, hi: 30 });
  assert.match(hold.suggestion.note, /seconds/);
});

test('applyHold: soreness stops an increase for that exercise only', () => {
  const hist = { SQ07: [{ sets: [{ weight: 15, reps: 12 }, { weight: 15, reps: 12 }], rating: 'good' }],
    HP07: [{ sets: [{ weight: 15, reps: 12 }, { weight: 15, reps: 12 }], rating: 'good' }] };
  const planned = planSession([item('SQ', 'SQ07'), item('HP', 'HP07', { slot: 'P2' })], { week: 5, cycleType: 'C1', history: hist });
  const { items } = applySoreness(planned, ['knees']);
  const out = applyHold(items);
  assert.equal(out[0].weight, 15);
  assert.equal(out[0].suggestion.action, 'hold');
  assert.equal(out[1].weight, 17.5, 'chest press untouched');
});

test('swapOptions: same pattern, eligible for her, not the current one', () => {
  const profile = { equipment: GYM, patternLevels: { SQ: 3 }, workarounds: [], restrictions: [], floorOk: false };
  const opts = swapOptions(slot('SQ'), profile, LIBRARY, 'SQ07');
  assert.deepEqual(opts.map((e) => e.id), ['SQ03', 'SQ06', 'SQ01']);
  const knees = swapOptions(slot('SQ'), { ...profile, patternLevels: { SQ: 4 } }, LIBRARY, 'SQ06', { todayWorkarounds: ['knees'] });
  assert.ok(!knees.some((e) => e.id === 'SQ07' || e.id === 'SQ11'), 'knee-heavy options excluded today');
});

test('lastTimeText', () => {
  assert.equal(lastTimeText('dumbbell', { weight: 15, sets: [{ reps: 12 }, { reps: 11 }] }, 'reps'), 'Last time: 15 lb × 12, 11');
  assert.equal(lastTimeText('bodyweight', { weight: null, sets: [{ reps: 12 }, { reps: 12 }] }, 'reps'), 'Last time: 12, 12 reps');
  assert.equal(lastTimeText('bodyweight', { weight: null, sets: [{ reps: 30 }] }, 'time'), 'Last time: 30 s');
  assert.equal(lastTimeText('dumbbell', { weight: 20, sets: [{ reps: 40 }] }, 'time'), 'Last time: 20 lb × 40 s');
  assert.equal(lastTimeText('band', null, 'reps'), '');
});

test('sessionSummary', () => {
  assert.deepEqual(sessionSummary([{ sets: [{}, {}] }, { sets: [{}] }, { skipped: true, sets: [] }]), { exercises: 2, sets: 3, skipped: 1 });
});
