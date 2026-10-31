import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksFromLogs, daysToNextCheckpoint, checkinActions, activeAdjustments, applyHoldAndTrim } from '../../web/engine/checkin.js';
import { weeklyCounts, plannedSessions, streaks, strengthWins, rewardMessage } from '../../web/engine/progress.js';
import { LIBRARY, slot } from './fixtures.js';

const log = (id, date, week, o = {}) => ({ id, log_date: date, week, session: o.session ?? 'A', status: o.status ?? 'done',
  feel: o.feel ?? 'right', energy: o.energy ?? 'ok', soreness: o.soreness ?? 'none', sore_areas: o.sore ?? [], workaround_areas: o.wa ?? [] });
const CYCLE = { start_date: '2026-11-02', week_modes: {} };

test('checksFromLogs: done/partial with a check-in, oldest first, pain attached', () => {
  const logs = [log(3, '2026-11-06', 1), log(1, '2026-11-02', 1), log(2, '2026-11-04', 1, { status: 'in_progress' }),
    { ...log(4, '2026-11-07', 1), feel: null }];
  const checks = checksFromLogs(logs, [{ type: 'pain', detail: { session_log_id: 3, area: 'knees' } }]);
  assert.deepEqual(checks.map((c) => c.id), [1, 3]);
  assert.deepEqual(checks[1].painAreas, ['knees']);
});

test('daysToNextCheckpoint', () => {
  assert.equal(daysToNextCheckpoint('2026-11-02', 1, '2026-11-02'), 21);
  assert.equal(daysToNextCheckpoint('2026-11-02', 5, '2026-11-30'), 28);
  assert.equal(daysToNextCheckpoint('2026-11-02', 9, '2026-12-28'), 0);
});

test('checkinActions: two too-hard sessions → hold and trim once', () => {
  const logs = [log(1, '2026-11-02', 1, { feel: 'too_hard' }), log(2, '2026-11-04', 1, { feel: 'too_hard' })];
  const r = checkinActions({ logs, cycle: CYCLE, week: 1, today: '2026-11-04', lastLogId: 2 });
  const hold = r.adjustments.find((a) => a.type === 'hold_and_trim');
  assert.deepEqual(hold.detail, { sessions: 3, after_log_id: 2 });
  assert.ok(r.messages.length >= 1);
  const again = checkinActions({ logs, cycle: CYCLE, week: 1, today: '2026-11-04', lastLogId: 2,
    adjustments: [{ type: 'hold_and_trim', detail: hold.detail }] });
  assert.ok(!again.adjustments.some((a) => a.type === 'hold_and_trim'), 'not repeated while active');
});

test('checkinActions: a hard week early in the cycle → next week lighter, once; later → no', () => {
  const one = checkinActions({ logs: [log(1, '2026-11-02', 1, { feel: 'too_hard' })], cycle: CYCLE, week: 1, perWeek: 3, today: '2026-11-02', lastLogId: 1 });
  assert.equal(one.adjustments.length, 0, 'one tough session out of three planned is not a hard week');
  const logs = [log(1, '2026-11-02', 1, { feel: 'too_hard' }), log(2, '2026-11-04', 1)];
  const r = checkinActions({ logs, cycle: CYCLE, week: 1, perWeek: 2, today: '2026-11-04', lastLogId: 2 });
  assert.deepEqual(r.adjustments.map((a) => [a.type, a.detail.week]), [['lighter_week_next', 2]]);
  const dup = checkinActions({ logs, cycle: CYCLE, week: 1, today: '2026-11-04', lastLogId: 2, adjustments: r.adjustments });
  assert.equal(dup.adjustments.length, 0);
  const near = checkinActions({ logs: logs.map((l) => ({ ...l, week: 2, log_date: '2026-11-10' })), cycle: CYCLE, week: 2, today: '2026-11-10', lastLogId: 2 });
  assert.equal(near.adjustments.length, 0, 'within 14 days of week 4');
  const used = checkinActions({ logs, cycle: { ...CYCLE, week_modes: {} }, week: 1, today: '2026-11-04', lastLogId: 2,
    adjustments: [{ type: 'lighter_week_next', detail: { week: 1 } }] });
  assert.deepEqual(used.flags.map((f) => f.detail.reason), ['second_lighter_week_trigger']);
});

test('checkinActions: same area 3 times in 14 days → one pattern flag', () => {
  const logs = [log(1, '2026-11-02', 1, { wa: ['knees'] }), log(2, '2026-11-04', 1, { soreness: 'a_lot', sore: ['knees'] }),
    log(3, '2026-11-06', 1, { wa: ['knees'] })];
  const r = checkinActions({ logs, cycle: CYCLE, week: 1, today: '2026-11-06', lastLogId: 3 });
  assert.deepEqual(r.flags.map((f) => [f.type, f.detail.area, f.detail.count]), [['pattern', 'knees', 3]]);
  const later = checkinActions({ logs, cycle: CYCLE, week: 1, today: '2026-11-06', lastLogId: 3,
    flags: [{ type: 'pattern', created_at: '2026-11-06T10:00:00Z', detail: { area: 'knees' } }] });
  assert.equal(later.flags.length, 0, 'not raised twice');
});

test('activeAdjustments and applyHoldAndTrim', () => {
  const adjustments = [{ type: 'hold_and_trim', detail: { sessions: 3, after_log_id: 2 } }, { type: 'lighter_week_next', detail: { week: 2 } }];
  const logs = [log(2, '2026-11-04', 1), log(3, '2026-11-06', 1), log(4, '2026-11-09', 2)];
  assert.deepEqual(activeAdjustments({ adjustments, logs, week: 2 }), { holdAndTrim: true, lighterWeek: true });
  assert.deepEqual(activeAdjustments({ adjustments, logs: [...logs, log(5, '2026-11-11', 2)], week: 3 }), { holdAndTrim: false, lighterWeek: false });
  const items = [
    { slot: slot('SQ'), dose: { sets: 3 }, weight: 20, lastWeight: 15, suggestion: { action: 'increase' } },
    { slot: slot('HP', { role: 'S' }), dose: { sets: 2 }, weight: 10, lastWeight: 10, suggestion: { action: 'hold' } },
  ];
  const out = applyHoldAndTrim(items);
  assert.equal(out[0].weight, 15);
  assert.equal(out[0].suggestion.action, 'hold');
  assert.equal(out[0].dose.sets, 3, 'primaries keep their sets');
  assert.equal(out[1].dose.sets, 1);
});

test('weeklyCounts, plannedSessions, streaks', () => {
  const logs = [log(1, '2026-11-02', 1), log(2, '2026-11-04', 1, { session: 'B' }), log(3, '2026-11-04', 1, { session: 'B' }),
    log(4, '2026-11-10', 2), log(5, '2026-11-17', 3, { status: 'in_progress' })];
  const weeks = weeklyCounts(logs, 3, 3);
  assert.deepEqual(weeks, [{ week: 1, planned: 3, done: 2 }, { week: 2, planned: 3, done: 1 }, { week: 3, planned: 3, done: 0 }]);
  assert.deepEqual(plannedSessions(weeks, 3).map((s) => s.done), [true, true, false, true, false, false]);
  assert.deepEqual(streaks(weeks, 3), { current: 0, best: 3, total: 3 });
  assert.deepEqual(streaks(weeklyCounts(logs, 2, 3), 2), { current: 3, best: 3, total: 3 }, 'this week’s gaps are not misses yet');
});

test('strengthWins: weight gains, rep gains, nothing for flat or single logs', () => {
  const lib = [...LIBRARY, { ...LIBRARY[0], id: 'CO02', name: 'Wall Plank', pattern: 'CO', measure: 'time' }];
  const L = (id, t, sets) => ({ exercise_id: id, created_at: t, sets });
  const logs = [
    L('SQ07', '2026-11-02', [{ weight: 10, reps: 12 }]), L('SQ07', '2026-11-16', [{ weight: 15, reps: 10 }]),
    L('SQ01', '2026-11-02', [{ reps: 8 }]), L('SQ01', '2026-11-16', [{ reps: 12 }]),
    L('HP04', '2026-11-02', [{ weight: 20, reps: 10 }]), L('HP04', '2026-11-16', [{ weight: 20, reps: 10 }]),
    L('CO02', '2026-11-02', [{ seconds: 20 }]), L('CO02', '2026-11-09', [{ seconds: 30 }]),
    L('VP01', '2026-11-02', [{ weight: 2, reps: 10 }]),
    { ...L('HI05', '2026-11-02', []), skipped: true },
  ];
  const wins = strengthWins(logs, lib);
  assert.deepEqual(wins.map((w) => [w.id, w.from, w.to]), [['SQ07', '10 lb', '15 lb'], ['SQ01', '8 reps', '12 reps'], ['CO02', '20 s', '30 s']]);
});

test('rewardMessage', () => {
  assert.match(rewardMessage(1), /First workout/);
  assert.match(rewardMessage(10), /someone who trains/);
  assert.ok(rewardMessage(7).length > 10);
});
