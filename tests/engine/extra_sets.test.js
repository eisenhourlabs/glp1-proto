// B8: the "too easy" rule (Framework §12) fires once per cycle and adds sets within the weekly volume ceiling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkinActions, activeAdjustments, primariesProgressing, extraSetSlots, applyExtraSets, extraSetsAllowed } from '../../web/engine/checkin.js';
import { slot } from './fixtures.js';

const log = (id, date, week, feel = 'too_easy') => ({ id, log_date: date, week, session: 'ABC'[(id - 1) % 3], status: 'done', feel, energy: 'ok',
  soreness: 'none', sore_areas: [], workaround_areas: [] });
const CYCLE = { start_date: '2026-11-02', week_modes: {} };
const week1 = [log(1, '2026-11-02', 1), log(2, '2026-11-04', 1), log(3, '2026-11-06', 1)];

test('B8: a whole week of "too easy" with primaries progressing → +1 set on 2 secondaries next week, once per cycle', () => {
  const r = checkinActions({ logs: week1, cycle: CYCLE, week: 1, perWeek: 3, today: '2026-11-06', lastLogId: 3, primariesProgressing: true });
  const a = r.adjustments.find((x) => x.type === 'extra_secondary_sets');
  assert.deepEqual(a.detail, { week: 2, sets: 1, slots: 2 });
  assert.match(r.messages.join(' '), /added a set/);
  const again = checkinActions({ logs: week1, adjustments: [a], cycle: CYCLE, week: 1, perWeek: 3, today: '2026-11-06', lastLogId: 3, primariesProgressing: true });
  assert.ok(!again.adjustments.some((x) => x.type === 'extra_secondary_sets'), 'once per cycle');
  assert.ok(!checkinActions({ logs: week1, cycle: CYCLE, week: 1, perWeek: 3, today: '2026-11-06', lastLogId: 3 }).adjustments
    .some((x) => x.type === 'extra_secondary_sets'), 'needs primaries progressing');
  const mixed = [...week1.slice(0, 2), log(3, '2026-11-06', 1, 'right')];
  assert.ok(!checkinActions({ logs: mixed, cycle: CYCLE, week: 1, perWeek: 3, today: '2026-11-06', lastLogId: 3, primariesProgressing: true }).adjustments
    .some((x) => x.type === 'extra_secondary_sets'), 'every session too easy');
  assert.equal(activeAdjustments({ adjustments: [a], logs: week1, week: 2 }).extraSets, true);
  assert.equal(activeAdjustments({ adjustments: [a], logs: week1, week: 3 }).extraSets, false);
  const w8 = week1.map((l) => ({ ...l, week: 8 }));
  assert.ok(!checkinActions({ logs: w8, cycle: CYCLE, week: 8, perWeek: 3, today: '2026-12-25', lastLogId: 3, primariesProgressing: true }).adjustments
    .some((x) => x.type === 'extra_secondary_sets'), 'not into the week-9 transition week');
  assert.deepEqual(['build', 'normal', 'consolidate', 'lighter', 'light', 'deload'].map(extraSetsAllowed), [true, true, true, false, false, false]);
});

test('primariesProgressing: every primary logged this week rated Good or Easy', () => {
  assert.equal(primariesProgressing([{ role: 'P', rating: 'good' }, { role: 'P', rating: 'easy' }, { role: 'S', rating: 'hard' }]), true);
  assert.equal(primariesProgressing([{ role: 'P', rating: 'good' }, { role: 'P', rating: 'hard' }]), false);
  assert.equal(primariesProgressing([{ role: 'P', rating: 'hard', skipped: true }, { role: 'P', rating: 'good' }]), true);
  assert.equal(primariesProgressing([{ role: 'S', rating: 'good' }]), false, 'no primary logged');
});

const sess = (letter, patterns) => patterns.map(([sl, role, pattern], i) => slot(pattern, { session: letter, slot: sl, ord: i + 1, role }));

test('extraSetSlots: first 2 secondaries per session, within the ceiling', () => {
  const s = { A: sess('A', [['P1', 'P', 'SQ'], ['S1', 'S', 'HR'], ['S2', 'S', 'VP'], ['S3', 'S', 'HI']]),
    B: sess('B', [['P1', 'P', 'HI'], ['S1', 'S', 'VR'], ['S2', 'S', 'SQ']]) };
  assert.deepEqual([...extraSetSlots(s, { week: 3, cycleType: 'C1' })], ['A:S1', 'A:S2', 'B:S1', 'B:S2']);
  // Quads already at the ceiling: the squat secondary is skipped, the next one takes its place.
  const tight = { A: sess('A', [['P1', 'P', 'SQ'], ['S1', 'S', 'SQ'], ['S2', 'S', 'HR'], ['S3', 'S', 'VR']]) };
  const keys = extraSetSlots(tight, { week: 3, cycleType: 'C1', settings: { 'volume.ceiling_c1_c2': 6 } });
  assert.deepEqual([...keys], ['A:S2', 'A:S3']);
});

test('applyExtraSets adds one set to the chosen slots only', () => {
  const items = [{ slot: { slot: 'S1' }, dose: { sets: 2 } }, { slot: { slot: 'S2' }, dose: { sets: 2 } }];
  const out = applyExtraSets(items, new Set(['A:S1']), 'A');
  assert.deepEqual(out.map((i) => i.dose.sets), [3, 2]);
  assert.equal(out[0].extraSet, true);
});
