import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, roundDownToStep, findYourWeight, suggestNext, scaleTodayWeight, reduceLoad } from '../../web/engine/load.js';

const R = { lo: 8, hi: 12 };
const last = (weight, reps, rating) => ({ weight, sets: reps.map((r) => ({ reps: r })), rating });

test('step: dumbbell rack, between-step weights, ends of the rack', () => {
  assert.equal(step('dumbbell', 15, 1), 17.5);
  assert.equal(step('dumbbell', 15, -1), 12);
  assert.equal(step('dumbbell', 16, 1), 17.5, 'between steps → next step up');
  assert.equal(step('dumbbell', 100, 1), 100, 'top of the rack');
  assert.equal(step('dumbbell', 15, 1, { available: [5, 10, 15] }), 15, 'home set tops out');
  assert.equal(step('band', 2, 1, { available: [5, 10, 15] }), 3, 'her dumbbell set never applies to bands');
});

test('step: machine, barbell by age band, band levels, bodyweight', () => {
  assert.equal(step('machine', 50, 1), 55);
  assert.equal(step('barbell', 95, 1, { lower: true, ageBand: '40-49' }), 105);
  assert.equal(step('barbell', 95, 1, { lower: true, ageBand: '50-59' }), 100);
  assert.equal(step('barbell', 45, 1, { lower: false, ageBand: '60-69' }), 47.5);
  assert.equal(step('band', 2, 1), 3);
  assert.equal(step('bodyweight', null, 1), null);
});

test('roundDownToStep', () => {
  assert.equal(roundDownToStep('dumbbell', 16.2), 15);
  assert.equal(roundDownToStep('machine', 47), 45);
});

test('findYourWeight (Framework §8.1)', () => {
  assert.equal(findYourWeight({ loadType: 'dumbbell', weight: 10, rating: 'easy' }).weight, 12);
  assert.equal(findYourWeight({ loadType: 'dumbbell', weight: 10, rating: 'easy', muchEasier: true }).weight, 15);
  assert.equal(findYourWeight({ loadType: 'dumbbell', weight: 10, rating: 'good' }).weight, 10);
  assert.equal(findYourWeight({ loadType: 'dumbbell', weight: 10, rating: 'hard' }).weight, 8);
});

test('first time on an exercise → find your weight', () => {
  assert.equal(suggestNext({ loadType: 'dumbbell', last: null, range: R }).action, 'find');
});

test('top of the range, good → one step up', () => {
  const s = suggestNext({ loadType: 'dumbbell', last: last(20, [12, 12, 12], 'good'), range: R, ageBand: '40-49' });
  assert.deepEqual([s.action, s.weight, s.targetReps], ['increase', 22.5, 8]);
});

test('easy and well past the range → two steps unless that jumps >10%', () => {
  const big = suggestNext({ loadType: 'machine', last: last(100, [15, 15, 15], 'easy'), range: R, ageBand: '40-49' });
  assert.equal(big.weight, 110, '10% → allowed');
  const capped = suggestNext({ loadType: 'machine', last: last(50, [15, 15, 15], 'easy'), range: R, ageBand: '40-49' });
  assert.equal(capped.weight, 55, '2 pins on 50 lb is 20% → one pin');
  const early = suggestNext({ loadType: 'machine', last: last(100, [15, 15, 15], 'easy'), range: R, earlyFoundations: true });
  assert.equal(early.weight, 105, 'C1 weeks 1–3 never double-jump');
});

test('within range → hold and add a rep; hard → hold', () => {
  const s = suggestNext({ loadType: 'dumbbell', last: last(20, [10, 9, 9], 'good'), range: R });
  assert.deepEqual([s.action, s.weight, s.targetReps], ['hold', 20, 10]);
  assert.equal(suggestNext({ loadType: 'dumbbell', last: last(20, [12, 12, 12], 'hard'), range: R }).action, 'hold');
});

test('below range, or hard twice → drop (≥ one step / 10%)', () => {
  const below = suggestNext({ loadType: 'dumbbell', last: last(20, [8, 7, 6], 'good'), range: R });
  assert.deepEqual([below.action, below.weight], ['decrease', 17.5]);
  const twice = suggestNext({ loadType: 'machine', last: last(100, [10, 10, 10], 'hard'), prevRating: 'hard', range: R });
  assert.deepEqual([twice.action, twice.weight], ['decrease', 90]);
});

test('60+ and kettlebells progress reps first', () => {
  const sixty = suggestNext({ loadType: 'dumbbell', last: last(15, [12, 12, 12], 'good'), range: R, ageBand: '60-69' });
  assert.deepEqual([sixty.action, sixty.targetReps], ['hold', 14]);
  const ready = suggestNext({ loadType: 'dumbbell', last: last(15, [14, 14, 14], 'good'), range: R, ageBand: '60-69' });
  assert.deepEqual([ready.action, ready.weight], ['increase', 17.5]);
  assert.equal(suggestNext({ loadType: 'kettlebell', last: last(18, [12, 12, 12], 'good'), range: R }).action, 'hold');
  assert.equal(suggestNext({ loadType: 'band', last: last(2, [12, 12, 12], 'good'), range: R }).action, 'hold', 'bands: reps first');
  assert.equal(suggestNext({ loadType: 'band', last: last(2, [14, 14, 14], 'good'), range: R }).weight, 3);
});

test('hold weeks never increase', () => {
  for (const weekMode of ['consolidate', 'lighter', 'light', 'deload']) {
    const s = suggestNext({ loadType: 'dumbbell', last: last(20, [12, 12, 12], 'easy'), range: R, weekMode });
    assert.equal(s.action, 'hold', weekMode);
  }
});

test('bodyweight progresses by tempo/level; equipment ceiling → level-up check', () => {
  assert.equal(suggestNext({ loadType: 'bodyweight', last: last(null, [12, 12], 'good'), range: R }).action, 'progress-bodyweight');
  const capped = suggestNext({ loadType: 'dumbbell', last: last(15, [12, 12, 12], 'good'), range: R, available: [5, 10, 15] });
  assert.equal(capped.action, 'level-up-check');
});

test('reduceLoad rounds to a loadable weight', () => {
  assert.equal(reduceLoad('machine', 45, 10), 40);
  assert.equal(reduceLoad('dumbbell', 25, 15), 20);
  assert.equal(reduceLoad('dumbbell', 25, 0), 25);
});

test('scale today: ~10% lighter, loadable', () => {
  assert.equal(scaleTodayWeight('dumbbell', 25), 22.5);
  assert.equal(scaleTodayWeight('machine', 100), 90);
  assert.equal(scaleTodayWeight('bodyweight', null), null);
});
