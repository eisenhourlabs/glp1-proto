import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekStreaks } from '../../web/engine/week_streak.js';

const wk = (...done) => done.map((d, i) => ({ week: i + 1, planned: 3, done: d }));

test('weekStreaks: counts weeks with every planned workout done', () => {
  assert.deepEqual(weekStreaks(wk(3, 3, 3), 4), { current: 3, best: 3 });
  assert.deepEqual(weekStreaks([], 1), { current: 0, best: 0 });
});

test('weekStreaks: one missed week is forgiven, two in a row start over', () => {
  assert.deepEqual(weekStreaks(wk(3, 2, 3, 3), 5), { current: 3, best: 3 }, 'a single short week does not break it');
  assert.deepEqual(weekStreaks(wk(3, 3, 3, 0, 1, 3), 7), { current: 1, best: 3 }, 'two short weeks in a row do');
});

test('weekStreaks: the week in progress is neither a hit nor a miss until it is complete', () => {
  assert.deepEqual(weekStreaks(wk(3, 3, 1), 3), { current: 2, best: 2 }, 'week 3 not finished yet');
  assert.deepEqual(weekStreaks(wk(3, 3, 3), 3), { current: 3, best: 3 }, 'week 3 finished: it counts now');
  assert.deepEqual(weekStreaks(wk(3, 0, 0), 3), { current: 1, best: 1 }, 'week 2 ended short (forgiven), week 3 still open');
});

test('weekStreaks: after the cycle (week 10) every week has ended', () => {
  const w = wk(3, 3, 3, 3, 3, 3, 3, 3, 1);
  assert.deepEqual(weekStreaks(w, 10), { current: 8, best: 8 });
});

test('the three progress numbers are no longer the same thing: workouts differ from weeks', () => {
  const weeks = wk(3, 3, 3, 3);
  assert.equal(weekStreaks(weeks, 5).current, 4, 'weeks');
  assert.equal(weeks.reduce((n, w) => n + w.done, 0), 12, 'workouts');
});
