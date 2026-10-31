import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentAdherence, lastWorkout, lastSkipReason, patientRow, SKIP_REASONS } from '../../web/engine/report.js';

const L = (date, status = 'done', o = {}) => ({ log_date: date, status, week: o.week ?? 1, session: o.session ?? 'A', cycle_id: 1, ...o });

test('recentAdherence: last 14 days, or since she started', () => {
  const logs = [L('2026-11-02'), L('2026-11-04'), L('2026-11-06', 'partial'), L('2026-11-09'), L('2026-11-11', 'skipped')];
  assert.deepEqual(recentAdherence(logs, 3, '2026-11-02', '2026-11-15'), { planned: 6, completed: 4, pct: 67 });
  assert.deepEqual(recentAdherence(logs, 3, '2026-11-02', '2026-11-04'), { planned: 1, completed: 2, pct: 100 }, 'first days');
  assert.deepEqual(recentAdherence(logs, 3, '2026-11-20', '2026-11-15'), { planned: 0, completed: 0, pct: null }, 'not started');
  assert.equal(recentAdherence(logs, 3, '2026-10-01', '2026-11-30').completed, 0, 'old workouts fall out of the window');
});

test('lastWorkout and lastSkipReason', () => {
  const logs = [L('2026-11-02'), L('2026-11-05', 'skipped', { skip_reason: 'busy' }), L('2026-11-04', 'partial'),
    L('2026-11-08', 'skipped', { skip_reason: 'travel' }), L('2026-11-09', 'in_progress')];
  assert.equal(lastWorkout(logs), '2026-11-04');
  assert.equal(lastSkipReason(logs), 'travel');
  assert.equal(lastWorkout([]), null);
  assert.equal(lastSkipReason([]), null);
  assert.equal(SKIP_REASONS.busy, 'Busy');
});

test('patientRow: week, this week, call flag, slipping', () => {
  const patient = { id: 'p', status: 'active', screening_flag: 'none', start_date: '2026-11-02' };
  const cycle = { id: 1, start_date: '2026-11-02' };
  const logs = [L('2026-11-02', 'done', { week: 1, session: 'A' }), L('2026-11-04', 'done', { week: 1, session: 'B' }),
    L('2026-11-10', 'done', { week: 2, session: 'A' })];
  const r = patientRow({ patient, profile: { display_name: 'Dana', clinic_id: 'c' }, cycle, logs, openFlags: 1, perWeek: 3, today: '2026-11-12' });
  assert.equal(r.name, 'Dana');
  assert.equal(r.week, 2);
  assert.equal(r.thisWeek, 1);
  assert.equal(r.lastWorkout, '2026-11-10');
  assert.equal(r.daysSince, 2);
  assert.equal(r.activeNow, true);
  assert.equal(r.checkInCall, false);
  assert.equal(r.openFlags, 1);
  const gone = patientRow({ patient, profile: {}, cycle, logs: logs.slice(0, 1), perWeek: 3, today: '2026-11-16' });
  assert.equal(gone.checkInCall, true, '14 days without a workout');
  assert.equal(gone.slipping, true);
  assert.equal(gone.activeNow, false);
  const paused = patientRow({ patient: { ...patient, status: 'paused' }, profile: {}, cycle: null, logs: [], perWeek: 3, today: '2026-11-16' });
  assert.equal(paused.checkInCall, false, 'only active patients go on the call list');
  assert.equal(paused.week, null);
});
