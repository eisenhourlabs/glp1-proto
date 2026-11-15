import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipOk, eligible, contextFor, resolveSlot, resolveSession, swapNote } from '../../web/engine/resolve.js';
import { LIBRARY, slot, GYM, MINIMAL } from './fixtures.js';

const byId = Object.fromEntries(LIBRARY.map((e) => [e.id, e]));

test('equipOk: all-of groups and any-of alternatives', () => {
  assert.equal(equipOk('db|kb;bench', ['kb', 'bench']), true);
  assert.equal(equipOk('db|kb;bench', ['kb']), false);
  assert.equal(equipOk('none', []), true);
  assert.equal(equipOk('', []), true);
});

test('eligible: level, equipment, restriction, floor, work-around, inactive', () => {
  const ctx = (o = {}) => contextFor(slot('SQ'), { equipment: GYM, patternLevels: { SQ: 3 }, ...o });
  assert.equal(eligible(byId.SQ07, ctx()), true);
  assert.equal(eligible(byId.SQ11, ctx()), false, 'level 4 above her level 3');
  assert.equal(eligible(byId.SQ07, ctx({ workarounds: ['knees'] })), false, 'knees load 2');
  assert.equal(eligible(byId.SQ07, ctx({ equipment: ['chair'] })), false, 'no db/kb');
  assert.equal(eligible(byId.VR99, contextFor(slot('VR'), { equipment: GYM })), false, 'inactive');
  const hi = (lvl, floorOk) => contextFor(slot('HI'), { equipment: GYM, patternLevels: { HI: lvl }, floorOk });
  assert.equal(eligible(byId.HI09, hi(3, false)), true, 'floor allowed from level 3');
  assert.equal(eligible(byId.HI09, { ...hi(3, false), level: 2 }), false);
  assert.equal(eligible(byId.HI09, contextFor(slot('HI'), { equipment: GYM, patternLevels: { HI: 3 }, restrictions: ['floor'] })), false);
});

test('resolveSlot picks the highest level she is ready for, with equipment', () => {
  const r = resolveSlot(slot('SQ'), { equipment: GYM, patternLevels: { SQ: 3 } }, LIBRARY);
  assert.equal(r.exercise.id, 'SQ07');
  assert.deepEqual(r.reasons, []);
});

test('resolveSlot explains an equipment swap', () => {
  const r = resolveSlot(slot('HP'), { equipment: MINIMAL, patternLevels: { HP: 3 } }, LIBRARY);
  assert.equal(r.exercise.id, 'HP01');
  assert.equal(r.reasons[0].type, 'equipment');
  assert.equal(swapNote(r.reasons), '', 'equipment matching is not shown to patients by default');
  assert.equal(swapNote(r.reasons, { includeEquipment: true }), 'Matched to the equipment you have.');
});

test('resolveSlot explains a work-around swap with the body area', () => {
  const r = resolveSlot(slot('SQ'), { equipment: GYM, patternLevels: { SQ: 3 } }, LIBRARY, { todayWorkarounds: ['knees'] });
  assert.notEqual(r.exercise.id, 'SQ07');
  assert.ok(r.exercise.area_load.knees <= 1);
  const w = r.reasons.find((x) => x.type === 'workaround');
  assert.equal(w.area, 'knees');
  assert.match(swapNote(r.reasons), /knees/);
});

test('resolveSlot respects restrictions and says so', () => {
  const r = resolveSlot(slot('VP'), { equipment: GYM, patternLevels: { VP: 2 }, restrictions: ['overhead'] }, LIBRARY);
  assert.equal(r.exercise.id, 'VP01');
  assert.equal(r.reasons[0].type, 'restriction');
});

test('her level beats prefer_ids (B2): a preferred exercise below her level loses to one at her level', () => {
  const r = resolveSlot(slot('HI', { prefer: ['HI05', 'HI01'] }), { equipment: GYM, patternLevels: { HI: 3 } }, LIBRARY);
  assert.equal(r.exercise.level, 3, 'level 3 hinge, not the preferred level-2 / level-1 picks');
  assert.ok(!['HI05', 'HI01'].includes(r.exercise.id));
});

test('prefer_ids choose among exercises at her level', () => {
  const r = resolveSlot(slot('HI', { prefer: ['HI09', 'HI07'] }), { equipment: GYM, patternLevels: { HI: 3 }, floorOk: true }, LIBRARY);
  assert.equal(r.exercise.id, 'HI09');
  const r2 = resolveSlot(slot('HI', { prefer: ['HI05', 'HI01'] }), { equipment: GYM, patternLevels: { HI: 2 } }, LIBRARY);
  assert.equal(r2.exercise.id, 'HI05', 'preferred and at her level');
});

test('when her level is ruled out, prefer_ids count at the highest level that fits', () => {
  // Level 3, but bend_load restricted and no floor: HI07 and HI09 are out; HI05 (level 2) is the top that fits.
  const profile = { equipment: GYM, patternLevels: { HI: 3 }, restrictions: ['bend_load', 'floor'] };
  assert.equal(resolveSlot(slot('HI', { prefer: ['HI01', 'HI05'] }), profile, LIBRARY).exercise.id, 'HI05', 'level-1 pick loses');
  assert.equal(resolveSlot(slot('HI', { prefer: ['HI05', 'HI01'] }), profile, LIBRARY).exercise.id, 'HI05');
});

test('variety in the week still comes before level', () => {
  const used = new Set(['SQ07']);
  const r = resolveSlot(slot('SQ'), { equipment: GYM, patternLevels: { SQ: 3 } }, LIBRARY, { used });
  assert.notEqual(r.exercise.id, 'SQ07');
});

test('levelDelta (make it easier) drops one level', () => {
  const r = resolveSlot(slot('SQ'), { equipment: GYM, patternLevels: { SQ: 3 } }, LIBRARY, { levelDelta: -1 });
  assert.equal(r.exercise.level, 2);
});

test('no option → exercise null with no-option reason', () => {
  const r = resolveSlot(slot('CA'), { equipment: GYM }, LIBRARY);
  assert.equal(r.exercise, null);
  assert.equal(r.reasons[0].type, 'no-option');
  assert.equal(swapNote(r.reasons), '');
});

test('resolveSession: minutes filter, order, and a different exercise for a repeated pattern', () => {
  const slots = [
    slot('SQ', { slot: 'P1', ord: 1 }),
    slot('HP', { slot: 'S1', ord: 2, role: 'S' }),
    slot('SQ', { slot: 'S2', ord: 3, role: 'S' }),
    slot('VR', { slot: 'O1', ord: 4, role: 'O', min_minutes: 45 }),
  ];
  const profile = { equipment: GYM, patternLevels: { SQ: 3, HP: 2, VR: 2 } };
  const at30 = resolveSession(slots, profile, LIBRARY, { minutes: 30 });
  assert.deepEqual(at30.map((r) => r.slot.slot), ['P1', 'S1', 'S2']);
  assert.notEqual(at30[0].exercise.id, at30[2].exercise.id, 'second squat is a different exercise');
  const at45 = resolveSession(slots, profile, LIBRARY, { minutes: 45 });
  assert.equal(at45.length, 4);
});
