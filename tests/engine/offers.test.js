import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldOfferLevelUp, allTop, repickPattern, levelUpOffers, OFFER_DEFAULTS } from '../../web/engine/offers.js';
import { LIBRARY, slot, GYM } from './fixtures.js';

const r = (top, rating) => ({ allTop: top, rating });
const top2 = [r(true, 'good'), r(false, 'good'), r(true, 'easy')];

test('B6 rule: 2 of the last 3 at the top, Good or Easy, at her ceiling', () => {
  assert.equal(shouldOfferLevelUp({ level: 2, recent: top2, atCeiling: true, week: 5 }), true);
  assert.equal(shouldOfferLevelUp({ level: 2, recent: [r(true, 'good'), r(true, 'hard')], atCeiling: true, week: 5 }), false);
  assert.equal(shouldOfferLevelUp({ level: 2, recent: top2, atCeiling: false, week: 5 }), false, 'can still add load');
  assert.equal(shouldOfferLevelUp({ level: 4, recent: top2, atCeiling: true, week: 5 }), false, 'top level');
  assert.equal(shouldOfferLevelUp({ level: 2, recent: top2, atCeiling: true, week: 5, maxLevel: 2 }), false, 'ceiling or 70+ cap');
});

test('B6: only from week 4 of a cycle (Amanda Q5), any cycle type', () => {
  assert.equal(OFFER_DEFAULTS['levelup.offer_min_week'], 4);
  assert.equal(shouldOfferLevelUp({ level: 1, recent: top2, atCeiling: true, week: 3 }), false);
  assert.equal(shouldOfferLevelUp({ level: 1, recent: top2, atCeiling: true, week: 4 }), true);
  assert.equal(shouldOfferLevelUp({ level: 1, recent: top2, atCeiling: true, week: 3, settings: { 'levelup.offer_min_week': 3 } }), true);
});

test('B6: "Not yet" holds the offer for 14 days; one accepted offer per pattern per cycle', () => {
  const base = { level: 1, recent: top2, atCeiling: true, week: 6, declinedOn: '2026-03-02' };
  assert.equal(shouldOfferLevelUp({ ...base, today: '2026-03-15' }), false);
  assert.equal(shouldOfferLevelUp({ ...base, today: '2026-03-16' }), true);
  assert.equal(shouldOfferLevelUp({ level: 1, recent: top2, atCeiling: true, week: 6, acceptedThisCycle: true }), false);
});

test('allTop', () => {
  assert.equal(allTop([{ reps: 12 }, { reps: 12 }], { lo: 10, hi: 12 }), true);
  assert.equal(allTop([{ reps: 12 }, { reps: 11 }], { lo: 10, hi: 12 }), false);
  assert.equal(allTop([], { lo: 10, hi: 12 }), false);
});

const profile = (levels) => ({ equipment: GYM, patternLevels: levels, workarounds: [], restrictions: [], floorOk: false });
const slots = [slot('HP', { session: 'A', slot: 'P1' }), slot('SQ', { session: 'A', slot: 'P2', ord: 2 }), slot('HP', { session: 'B', slot: 'S1', role: 'S' })];
const items = [
  { session: 'A', slot: 'P1', ord: 1, pattern: 'HP', exercise_id: 'HP01' },
  { session: 'A', slot: 'P2', ord: 2, pattern: 'SQ', exercise_id: 'SQ01' },
  { session: 'B', slot: 'S1', ord: 1, pattern: 'HP', exercise_id: 'HP01' },
];

test('repickPattern: only that pattern, at the new level, other items untouched', () => {
  const picks = repickPattern(items, slots, 'HP', profile({ HP: 2, SQ: 1 }), LIBRARY);
  assert.deepEqual(picks.map((p) => [p.session, p.slot, p.exercise_id, p.from]), [['A', 'P1', 'HP04', 'HP01'], ['B', 'S1', 'HP04', 'HP01']]);
  assert.deepEqual(repickPattern(items, slots, 'HP', profile({ HP: 1, SQ: 1 }), LIBRARY), [], 'same level: nothing changes');
});

const hp01 = LIBRARY.find((e) => e.id === 'HP01');
const row = (reps, rating, stage, day) => ({ sets: reps.map((n) => ({ reps: n, stage })), rating, skipped: false, created_at: `2026-02-${day}T12:00:00Z` });
const ctx = (o = {}) => ({ week: 5, cycleItems: items, slots, profile: profile({ HP: 1, SQ: 1 }), library: LIBRARY, ceilings: { HP: 4 },
  ageBand: '40-49', adjustments: [], today: '2026-02-20', settings: {}, ...o });
const line = { slot: slots[0], exercise: hp01, range: { lo: 10, hi: 12 }, measure: 'reps' };
// Bodyweight at the end of the ladder (pause stage, top of range) twice.
const done = { HP01: [row([12, 12], 'good', 2, 20), row([12, 12], 'good', 2, 18), row([12, 12], 'good', 1, 16)] };

test('levelUpOffers: bodyweight at the end of reps → tempo → pause offers the next level', () => {
  const [o] = levelUpOffers([line], done, ctx());
  assert.deepEqual([o.pattern, o.from, o.to, o.next.id], ['HP', 1, 2, 'HP04']);
  assert.equal(o.picks.length, 2, 'both HP slots move for the rest of the cycle');
});

test('levelUpOffers: no offer mid-ladder, before week 4, after a recent "Not yet", or with nothing harder', () => {
  assert.deepEqual(levelUpOffers([line], { HP01: [row([12, 12], 'good', 1, 20), row([12, 12], 'good', 0, 18)] }, ctx()), [], 'still on the tempo step');
  assert.deepEqual(levelUpOffers([line], done, ctx({ week: 3 })), []);
  assert.deepEqual(levelUpOffers([line], done, ctx({ adjustments: [{ type: 'level_offer_declined', detail: { pattern: 'HP' }, created_at: '2026-02-12T10:00:00Z' }] })), []);
  assert.equal(levelUpOffers([line], done, ctx({ adjustments: [{ type: 'level_offer_declined', detail: { pattern: 'HP' }, created_at: '2026-02-05T10:00:00Z' }] })).length, 1, '15 days later');
  assert.deepEqual(levelUpOffers([line], done, ctx({ ceilings: { HP: 1 } })), [], 'her ceiling');
  assert.deepEqual(levelUpOffers([line], done, ctx({ profile: { ...profile({ HP: 1 }), equipment: ['wall'] } })), [], 'no harder option for her equipment');
  assert.deepEqual(levelUpOffers([{ ...line, slot: { ...slots[0], role: 'F' } }], done, ctx()), [], 'finishers are not offered');
});

test('levelUpOffers: dumbbells at the top of her own set', () => {
  const sq07 = LIBRARY.find((e) => e.id === 'SQ07');
  const sqItems = [{ session: 'A', slot: 'P2', ord: 2, pattern: 'SQ', exercise_id: 'SQ07' }];
  const hist = { SQ07: [{ sets: [{ weight: 15, reps: 12 }, { weight: 15, reps: 12 }], rating: 'good', skipped: false }, { sets: [{ weight: 15, reps: 12 }, { weight: 15, reps: 12 }], rating: 'easy', skipped: false }] };
  const c = ctx({ cycleItems: sqItems, profile: profile({ SQ: 3 }), ceilings: { SQ: 4 } });
  assert.equal(levelUpOffers([{ slot: slots[1], exercise: sq07, range: { lo: 10, hi: 12 } }], hist, { ...c, dumbbells: [10, 15] })[0]?.next.id, 'SQ11');
  assert.deepEqual(levelUpOffers([{ slot: slots[1], exercise: sq07, range: { lo: 10, hi: 12 } }], hist, c), [], 'a full rack: add weight instead');
});
