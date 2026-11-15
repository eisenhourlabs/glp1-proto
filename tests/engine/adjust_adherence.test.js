import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkinAdjustments, patternFlags, restSignals } from '../../web/engine/adjust.js';
import { adherence, forgivingStreak, bestStreak, comebackMode, restartDue, needsCheckInCall, isSlipping } from '../../web/engine/adherence.js';

const c = (date, o = {}) => ({ date, feel: 'right', energy: 'ok', soreAreas: [], workaroundAreas: [], painAreas: [], soreness: 'none', ...o });

test('too hard twice → hold and trim', () => {
  const out = checkinAdjustments([c('2026-11-02'), c('2026-11-04', { feel: 'too_hard' }), c('2026-11-06', { feel: 'too_hard' })]);
  assert.equal(out[0].type, 'hold_and_trim');
  assert.equal(out[0].sessions, 3);
});

test('hard week → lighter week next, unless one was used (admin flag) or a checkpoint is near', () => {
  const week = [c('2026-11-02', { feel: 'too_hard' }), c('2026-11-04'), c('2026-11-06', { feel: 'too_hard' })];
  assert.ok(checkinAdjustments([], { thisWeekChecks: week, daysToNextCheckpoint: 21 }).some((x) => x.type === 'lighter_week_next'));
  assert.ok(checkinAdjustments([], { thisWeekChecks: week, lighterWeekUsedThisCycle: true }).some((x) => x.type === 'admin_flag'));
  assert.equal(checkinAdjustments([], { thisWeekChecks: week, daysToNextCheckpoint: 7 }).length, 0);
  const early = [c('2026-11-02', { feel: 'too_hard' })];
  assert.equal(checkinAdjustments([], { thisWeekChecks: early, plannedThisWeek: 3, daysToNextCheckpoint: 21 }).length, 0, '1 of 3 planned');
  assert.ok(checkinAdjustments([], { thisWeekChecks: week, plannedThisWeek: 4, daysToNextCheckpoint: 21 }).length, '2 of 4 planned');
  const low = [c('2026-11-02', { energy: 'low' }), c('2026-11-04', { energy: 'low' })];
  assert.equal(checkinAdjustments([], { thisWeekChecks: low, daysToNextCheckpoint: 30 })[0].reason, 'low_energy_week');
});

test('too easy all week with progress → extra secondary sets once', () => {
  const week = [c('2026-11-02', { feel: 'too_easy' }), c('2026-11-04', { feel: 'too_easy' })];
  assert.equal(checkinAdjustments([], { thisWeekChecks: week, allPrimariesProgressedThisWeek: true })[0].type, 'extra_secondary_sets');
  assert.equal(checkinAdjustments([], { thisWeekChecks: week, allPrimariesProgressedThisWeek: true, extraSetsUsedThisCycle: true }).length, 0);
});

test('pattern flags: same area 3× in 14 days; pain marked', () => {
  const checks = [
    c('2026-11-01', { workaroundAreas: ['knees'] }),
    c('2026-11-05', { soreness: 'a_lot', soreAreas: ['knees'] }),
    c('2026-11-09', { painAreas: ['knees'] }),
    c('2026-11-09', { soreness: 'some', soreAreas: ['shoulders'] }),
  ];
  const f = patternFlags(checks, '2026-11-10');
  assert.deepEqual(f, [{ area: 'knees', count: 3, pain: true }]);
  assert.equal(patternFlags(checks, '2026-11-20').length, 0, 'older than 14 days drops off');
});

test('restSignals counts the last 14 days', () => {
  const s = restSignals([c('2026-10-01', { feel: 'too_hard' }), c('2026-11-05', { feel: 'too_hard', energy: 'low' })], '2026-11-10', { stalledPrimaries: 1 });
  assert.deepEqual(s, { tooHard: 1, lowEnergy: 1, flags: 0, stalledPrimaries: 1 });
});

test('adherence and forgiving streak (never two in a row)', () => {
  assert.equal(adherence(3, 2).toFixed(2), '0.67');
  assert.equal(adherence(0, 0), null);
  const s = (pattern) => pattern.split('').map((x, i) => ({ date: `d${i}`, done: x === '1' }));
  assert.equal(forgivingStreak(s('1111')), 4);
  assert.equal(forgivingStreak(s('11101')), 4, 'one miss forgiven');
  assert.equal(forgivingStreak(s('110011')), 2, 'two misses in a row break it');
  assert.equal(forgivingStreak(s('1110')), 3, 'latest miss alone keeps the streak');
  assert.equal(bestStreak(s('1111001')), 4);
});

test('comeback modes by gap (§13)', () => {
  assert.equal(comebackMode('2026-11-01', '2026-11-05').mode, 'none');
  assert.equal(comebackMode('2026-11-01', '2026-11-09').mode, 'welcome_back');
  assert.equal(comebackMode('2026-11-01', '2026-11-15').mode, 'reentry');
  assert.deepEqual(comebackMode('2026-11-01', '2026-11-29'), { mode: 'restart', setDelta: 0, loadCutPct: 20, sessions: 0 });
  assert.equal(comebackMode(null, '2026-11-29').mode, 'none');
});

test('clinic flags', () => {
  assert.equal(needsCheckInCall('2026-11-01', '2026-10-01', '2026-11-08'), true);
  assert.equal(needsCheckInCall(null, '2026-11-05', '2026-11-08'), false);
  assert.equal(isSlipping(6, 2), true);
  assert.equal(isSlipping(6, 3), false);
});

test('B7: 14–27 days away means two lighter sessions; the second cuts only what she has not done since', () => {
  const second = comebackMode('2026-11-16', '2026-11-18', {}, { gap: 16, date: '2026-11-16' });
  assert.deepEqual(second, { mode: 'reentry', setDelta: -1, loadCutPct: 15, sessions: 2, second: true, cutBefore: '2026-11-16' });
  assert.equal(comebackMode('2026-11-18', '2026-11-20', {}, { gap: 2, date: '2026-11-18' }).mode, 'none', 'third session: normal');
  assert.equal(comebackMode('2026-11-16', '2026-11-18', {}, { gap: 9, date: '2026-11-16' }).mode, 'none', 'a welcome back is one session');
  assert.equal(comebackMode('2026-11-16', '2026-11-18', {}, { gap: 30, date: '2026-11-16' }).mode, 'none', 'a restart is one lighter session');
  assert.equal(comebackMode('2026-11-01', '2026-11-29', {}, { gap: 16 }).mode, 'restart', 'a new long gap wins');
});

test('B7: restartDue — 28+ days inside the training weeks restarts at week 1; after week 9 the review comes first', () => {
  assert.equal(restartDue({ mode: 'restart', rawWeek: 8, lastWeekInCycle: 3 }), true);
  assert.equal(restartDue({ mode: 'restart', rawWeek: 11, lastWeekInCycle: 5 }), true, 'came back after the cycle ended, gap began in week 5');
  assert.equal(restartDue({ mode: 'restart', rawWeek: 7, lastWeekInCycle: null }), true, 'never trained in this cycle');
  assert.equal(restartDue({ mode: 'restart', rawWeek: 13, lastWeekInCycle: 9 }), false, 'finished the cycle: review');
  assert.equal(restartDue({ mode: 'restart', rawWeek: 8, lastWeekInCycle: 3, proposalReady: true }), false);
  assert.equal(restartDue({ mode: 'reentry', rawWeek: 8, lastWeekInCycle: 3 }), false);
  assert.equal(restartDue({ mode: 'restart', rawWeek: 1, lastWeekInCycle: null }), false, 'already week 1');
});
