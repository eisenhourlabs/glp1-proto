import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startingLevels, startingCycle, shouldOfferLevelUp, shouldDropLevel } from '../../web/engine/levels.js';

test('starting levels from experience + Workout 1 check', () => {
  const none = startingLevels({ experience: 'none' });
  assert.equal(none.SQ, 1); assert.equal(none.AR, 1);
  const some = startingLevels({ experience: 'some', check: { sitToStand: true } });
  assert.deepEqual([some.SQ, some.SL, some.HP, some.HI], [3, 3, 2, 2]);
  const capped = startingLevels({ experience: 'regular', check: { sitToStand: true, inclinePushup: true, hinge: true } });
  assert.ok(Object.values(capped).every((l) => l === 3), 'regular + all checks → every pattern 3, never above');
  const partial = startingLevels({ experience: 'regular', check: { hinge: true } });
  assert.deepEqual([partial.HI, partial.HR], [3, 2], 'partial checks bump only the checked patterns');
  assert.equal(startingLevels({ experience: 'regular', check: { sitToStand: true }, ageBand: '70+' }).SQ, 2, '70+ capped at 2');
});

test('starting cycle', () => {
  assert.equal(startingCycle({ experience: 'regular', check: { sitToStand: true, inclinePushup: true, hinge: true } }), 'C2');
  assert.equal(startingCycle({ experience: 'regular', check: { sitToStand: true } }), 'C1');
  assert.equal(startingCycle({ experience: 'some', check: { sitToStand: true, inclinePushup: true, hinge: true } }), 'C1');
});

test('level-up offers', () => {
  const r = (allTop, rating) => ({ allTop, rating });
  assert.equal(shouldOfferLevelUp({ level: 2, recent: [r(true, 'good'), r(false, 'good'), r(true, 'easy')], atCeiling: true }), true);
  assert.equal(shouldOfferLevelUp({ level: 2, recent: [r(true, 'good'), r(true, 'hard')], atCeiling: true }), false);
  assert.equal(shouldOfferLevelUp({ level: 2, recent: [r(true, 'good'), r(true, 'good')], atCeiling: false }), false, 'not at her ceiling: add weight instead');
  assert.equal(shouldOfferLevelUp({ level: 2, cleanCycleAtLevel: true }), true);
  assert.equal(shouldOfferLevelUp({ level: 4, cleanCycleAtLevel: true }), false);
  const top2 = [r(true, 'good'), r(true, 'good')];
  assert.equal(shouldOfferLevelUp({ level: 1, recent: top2, atCeiling: true, cycleType: 'C1', week: 2 }), false, 'technique weeks');
  assert.equal(shouldOfferLevelUp({ level: 1, recent: top2, atCeiling: true, cycleType: 'C1', week: 3 }), true);
});

test('level drops', () => {
  assert.equal(shouldDropLevel({ level: 2, hardMissesAtLowest: 2 }), true);
  assert.equal(shouldDropLevel({ level: 2, flags14d: 2 }), true);
  assert.equal(shouldDropLevel({ level: 1, flags14d: 5 }), false);
  assert.equal(shouldDropLevel({ level: 3, hardMissesAtLowest: 1, flags14d: 1 }), false);
});
