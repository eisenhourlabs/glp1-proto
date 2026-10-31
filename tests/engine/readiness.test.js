import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleToday, makeEasier, applyWorkarounds, applySoreness } from '../../web/engine/readiness.js';
import { resolveSession } from '../../web/engine/resolve.js';
import { LIBRARY, slot, GYM } from './fixtures.js';

const profile = { equipment: GYM, patternLevels: { SQ: 3, HP: 3, HI: 3, VR: 2 } };
const session = () => resolveSession([
  slot('SQ', { slot: 'P1', ord: 1, role: 'P' }),
  slot('HP', { slot: 'S1', ord: 2, role: 'S' }),
  slot('VR', { slot: 'O1', ord: 3, role: 'O', min_minutes: 30 }),
], profile, LIBRARY, { minutes: 45 }).map((it) => ({ ...it, dose: { sets: 3, reps: { lo: 8, hi: 12 }, rir: '2' }, weight: 25 }));

test('scaleToday: primaries lighter at RIR 3, secondaries −1 set, optional dropped', () => {
  const out = scaleToday(session());
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].weight, out[0].dose.rir, out[0].dose.sets], [22.5, '3', 3]);
  assert.equal(out[1].dose.sets, 2);
  assert.ok(out.every((x) => x.scaled));
});

test('makeEasier drops a level and clears the weight when the exercise changes', () => {
  const out = makeEasier(session(), profile, LIBRARY);
  assert.equal(out[0].exercise.level, 2);
  assert.equal(out[0].weight, null);
});

test('work-around swaps knee-heavy exercises and reports them', () => {
  const { items, swaps } = applyWorkarounds(session(), ['knees'], profile, LIBRARY);
  assert.equal(swaps.length, 1);
  assert.equal(swaps[0].from, 'SQ07');
  assert.ok(items[0].exercise.area_load.knees <= 1);
  assert.equal(items[0].swappedFor, 'knees');
  assert.equal(applyWorkarounds(session(), [], profile, LIBRARY).swaps.length, 0);
});

test('soreness keeps exercises, holds load, trims secondaries', () => {
  const { items, touched } = applySoreness(session(), ['shoulders']);
  assert.deepEqual(touched, ['P1', 'S1']);
  assert.equal(items[0].dose.sets, 3, 'primary keeps sets');
  assert.equal(items[1].dose.sets, 2, 'secondary −1');
  assert.ok(items[0].holdLoad);
});
