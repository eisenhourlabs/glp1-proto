import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TESTS, TEST_IDS, benchmarksEnabled, benchmarkMoment, parseValue, validVariant, benchmarkProgress } from '../../web/engine/benchmarks.js';

const on = { 'benchmarks.enabled': true };

test('the switch: only an explicit on turns it on', () => {
  for (const v of [true, 1, '1', 'true']) assert.equal(benchmarksEnabled({ 'benchmarks.enabled': v }), true, String(v));
  for (const v of [false, 0, '0', 'false', null, undefined, 'yes', 2]) assert.equal(benchmarksEnabled({ 'benchmarks.enabled': v }), false, String(v));
  assert.equal(benchmarksEnabled({}), false);
  assert.equal(benchmarksEnabled(undefined), false);
});

test('three tests with generic ids', () => {
  assert.deepEqual(TEST_IDS, ['lower_body', 'upper_body', 'carry_hold']);
  assert.equal(TESTS.find((t) => t.id === 'carry_hold').unit, 'seconds');
});

test('moment: nothing is offered while it is switched off', () => {
  assert.equal(benchmarkMoment({ settings: {}, rows: [], cycleId: 1, rawWeek: 1, doneWorkouts: 1 }), null);
  assert.equal(benchmarkMoment({ settings: { 'benchmarks.enabled': false }, rows: [], cycleId: 1, rawWeek: 9, doneWorkouts: 5 }), null);
});

test('moment: baseline at the second workout, once', () => {
  const m = (o) => benchmarkMoment({ settings: on, rows: [], cycleId: 1, rawWeek: 1, doneWorkouts: 1, ...o });
  assert.equal(m({ doneWorkouts: 0 }), null, 'not before her first workout');
  assert.equal(m({}), 'baseline');
  assert.equal(m({ doneWorkouts: 3, rawWeek: 3 }), 'baseline', 'still offered later until she has done or dismissed it');
  assert.equal(m({ rows: [{ moment: 'baseline', cycle_id: 1 }] }), null, 'recorded already');
  assert.equal(m({ cycleId: 2, rows: [{ moment: 'baseline', cycle_id: 1 }] }), null, 'baseline is once ever, not once a cycle');
});

test('moment: transition in week 9 of each cycle', () => {
  const m = (o) => benchmarkMoment({ settings: on, rows: [], cycleId: 1, rawWeek: 9, doneWorkouts: 8, ...o });
  assert.equal(m({}), 'transition');
  assert.equal(m({ rawWeek: 10 }), 'transition', 'the weeks between cycles count too');
  assert.equal(m({ rows: [{ moment: 'transition', cycle_id: 1 }] }), null);
  assert.equal(m({ cycleId: 2, rows: [{ moment: 'transition', cycle_id: 1 }] }), 'transition', 'a new cycle has its own transition');
  assert.equal(m({ rows: [{ moment: 'baseline', cycle_id: 1 }] }), 'transition', 'a baseline does not stand in for it');
});

test('parseValue: whole numbers in range only', () => {
  assert.equal(parseValue('lower_body', '12'), 12);
  assert.equal(parseValue('lower_body', ' 0 '), 0);
  assert.equal(parseValue('lower_body', 60), 60);
  for (const bad of ['', ' ', '-1', '1.5', 'abc', '61', '1e2', '1000', null, undefined]) assert.equal(parseValue('lower_body', bad), null, String(bad));
  assert.equal(parseValue('carry_hold', '600'), 600);
  assert.equal(parseValue('carry_hold', '601'), null);
  assert.equal(parseValue('chair_stand', '5'), null, 'unknown test');
});

test('validVariant: only the test’s own versions', () => {
  assert.equal(validVariant('upper_body', 'wall'), true);
  assert.equal(validVariant('upper_body', 'bench'), false);
  assert.equal(validVariant('upper_body', null), false, 'a test with versions needs one');
  assert.equal(validVariant('lower_body', null), true);
  assert.equal(validVariant('lower_body', 'wall'), false);
  assert.equal(validVariant('nope', null), false);
});

test('progress: first against latest, like with like', () => {
  const rows = [
    { test: 'lower_body', value: 9, variant: null, created_at: '2026-11-03T10:00:00Z' },
    { test: 'lower_body', value: 13, variant: null, created_at: '2027-01-05T10:00:00Z' },
    { test: 'upper_body', value: 6, variant: 'wall', created_at: '2026-11-03T10:00:00Z' },
    { test: 'upper_body', value: 5, variant: 'incline', created_at: '2027-01-05T10:00:00Z' },
    { test: 'carry_hold', value: 30, variant: null, created_at: '2026-11-03T10:00:00Z' },
  ];
  const p = benchmarkProgress([...rows].reverse());
  assert.deepEqual(p.map((x) => x.test), ['lower_body', 'upper_body', 'carry_hold'], 'in the fixed test order');
  assert.deepEqual([p[0].first.value, p[0].latest.value, p[0].change, p[0].sameVariant], [9, 13, 4, true]);
  assert.deepEqual([p[1].change, p[1].sameVariant, p[1].latest.variant], [null, false, 'incline'], 'a harder version gives no number');
  assert.deepEqual([p[2].count, p[2].change], [1, null], 'one result: no change yet');
  assert.deepEqual(benchmarkProgress([]), []);
});
