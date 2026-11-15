import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfLighterRange, selfLighterState, shortVersion, LIGHTER_DEFAULTS } from '../../web/engine/lighter.js';
import { slot } from './fixtures.js';

const adj = (from, to) => ({ type: 'self_lighter_week', detail: { from, to } });

test('B9: a lighter week covers 7 days from the tap', () => {
  assert.deepEqual(selfLighterRange('2026-03-04'), { from: '2026-03-04', to: '2026-03-10' });
});

test('B9: active for its 7 days, at most twice a cycle, not on top of an already lighter week', () => {
  assert.equal(LIGHTER_DEFAULTS['lighter.self_max_per_cycle'], 2);
  const s0 = selfLighterState({ adjustments: [], today: '2026-03-04' });
  assert.deepEqual([s0.active, s0.canStart, s0.usedUp], [false, true, false]);
  const one = [adj('2026-03-04', '2026-03-10')];
  const s1 = selfLighterState({ adjustments: one, today: '2026-03-10' });
  assert.deepEqual([s1.active, s1.until, s1.canStart], [true, '2026-03-10', false]);
  assert.equal(selfLighterState({ adjustments: one, today: '2026-03-11' }).canStart, true);
  const two = [...one, adj('2026-03-20', '2026-03-26')];
  const s2 = selfLighterState({ adjustments: two, today: '2026-03-30' });
  assert.deepEqual([s2.used, s2.canStart, s2.usedUp], [2, false, true], 'after two: talk with the clinic');
  for (const weekMode of ['lighter', 'light', 'deload']) assert.equal(selfLighterState({ today: '2026-03-04', weekMode }).canStart, false, weekMode);
  assert.equal(selfLighterState({ today: '2026-03-04', weekMode: 'consolidate' }).canStart, true);
  assert.equal(selfLighterState({ adjustments: two, today: '2026-03-30', settings: { 'lighter.self_max_per_cycle': 3 } }).canStart, true);
});

const it = (pattern, role, ord) => ({ slot: slot(pattern, { role, ord, slot: `${role}${ord}` }), exercise: { id: `${pattern}01` }, dose: { sets: 3 } });
const session = [it('SQ', 'P', 1), it('HP', 'P', 2), it('HI', 'P', 3), it('HR', 'S', 4), it('CO', 'F', 5), it('BA', 'F', 6), it('VR', 'O', 7)];

test('B9: short version = two main lifts and one finisher, doses unchanged', () => {
  const s = shortVersion(session);
  assert.deepEqual(s.map((x) => x.slot.slot), ['P1', 'P2', 'F5']);
  assert.ok(s.every((x) => x.short && x.dose.sets === 3));
  assert.deepEqual(shortVersion(session, { ageBand: '60-69' }).map((x) => x.slot.slot), ['P1', 'P2', 'F6'], '60+: the balance finisher');
  assert.deepEqual(shortVersion([it('SQ', 'P', 1), it('HR', 'S', 2)]).map((x) => x.slot.slot), ['P1']);
});
