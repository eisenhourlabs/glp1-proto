import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeState, cycleLabel, cycleComplete, comebackFrom, restDaySuggested } from '../../web/engine/home_state.js';
import { comebackMode } from '../../web/engine/adherence.js';

const base = { rawWeek: 3, weekComplete: false, proposalReady: false, comeback: 'none', weekMode: 'build', lighterByCheckin: false };
const notice = (o) => homeState({ ...base, ...o }).notice;

test('cycleLabel: week N of 9 during the cycle, "Cycle complete" after week 9 ends', () => {
  assert.equal(cycleLabel(0, false), 'Week 1 of 9');
  assert.equal(cycleLabel(4, true), 'Week 4 of 9');
  assert.equal(cycleLabel(9, false), 'Week 9 of 9');
  assert.equal(cycleLabel(9, true), 'Cycle complete');
  assert.equal(cycleLabel(10, false), 'Cycle complete');
  assert.equal(cycleLabel(14, false), 'Cycle complete');
});

test('cycleComplete', () => {
  assert.equal(cycleComplete(8, true), false);
  assert.equal(cycleComplete(9, false), false);
  assert.equal(cycleComplete(9, true), true);
  assert.equal(cycleComplete(10, false), true);
});

test('homeState: normal week has no notice', () => {
  assert.equal(notice({}), null);
});

test('homeState: priority order, one notice only', () => {
  const everything = { paused: true, rawWeek: 9, proposalReady: false, comeback: 'welcome_back', weekMode: 'light', lighterByCheckin: true };
  assert.equal(notice(everything), 'paused');
  assert.equal(notice({ ...everything, paused: false }), 'review_due');
  assert.equal(notice({ ...everything, paused: false, proposalReady: true }), 'next_ready');
  assert.equal(notice({ ...everything, paused: false, rawWeek: 4 }), 'comeback');
  assert.equal(notice({ ...everything, paused: false, rawWeek: 4, comeback: 'none' }), 'week_mode');
  assert.equal(notice({ rawWeek: 0, comeback: 'restart', weekMode: 'consolidate' }), 'upcoming');
});

test('homeState: every combination returns exactly one known notice', () => {
  const known = new Set(['paused', 'upcoming', 'review_due', 'next_ready', 'comeback', 'week_mode', 'rest_day', null]);
  for (const paused of [false, true]) for (const rawWeek of [0, 1, 4, 8, 9, 10, 13])
    for (const weekComplete of [false, true]) for (const proposalReady of [false, true])
      for (const comeback of ['none', 'welcome_back', 'reentry', 'restart'])
        for (const weekMode of ['build', 'consolidate', 'lighter', 'light', 'deload', 'normal'])
          for (const lighterByCheckin of [false, true]) {
            const s = homeState({ paused, rawWeek, weekComplete, proposalReady, comeback, weekMode, lighterByCheckin });
            assert.ok(known.has(s.notice), JSON.stringify(s));
            if (paused) assert.equal(s.notice, 'paused');
            if (!paused && rawWeek >= 9) assert.ok(['review_due', 'next_ready'].includes(s.notice), 'review wins in week 9 on');
            if (rawWeek >= 10) assert.equal(s.label, 'Cycle complete');
          }
});

test('homeState: week-mode note from the adaptive week or a lighter week from check-ins', () => {
  assert.equal(notice({ rawWeek: 4, weekMode: 'consolidate' }), 'week_mode');
  assert.equal(notice({ rawWeek: 6, lighterByCheckin: true }), 'week_mode');
  assert.equal(notice({ rawWeek: 6, weekMode: 'build' }), null);
});

test('homeState: complete flag for the review copy', () => {
  assert.equal(homeState({ ...base, rawWeek: 9 }).complete, false);
  assert.equal(homeState({ ...base, rawWeek: 9, weekComplete: true }).complete, true);
  assert.equal(homeState({ ...base, rawWeek: 11 }).complete, true);
});

test('comebackFrom: same cycle or unknown cycle → her last workout date', () => {
  assert.equal(comebackFrom(null, { start_date: '2026-01-05' }), null);
  assert.equal(comebackFrom({ date: '2026-02-01', cycleStart: '2026-01-05' }, { start_date: '2026-01-05' }), '2026-02-01');
  assert.equal(comebackFrom({ date: '2026-02-01' }, { start_date: '2026-03-30' }), '2026-02-01');
});

test('comebackFrom: waiting on the review between cycles is not a gap (perfect record → no welcome back)', () => {
  // Cycle 1 started Jan 5, ended Mar 9 (63 days). Last workout Mar 6 (week 9). Review done and Cycle 2 started Mar 30.
  const from = comebackFrom({ date: '2026-03-06', cycleStart: '2026-01-05' }, { start_date: '2026-03-30' });
  assert.equal(from, '2026-03-27', 'moved forward by the 21 idle days');
  assert.equal(comebackMode(from, '2026-03-30', {}).mode, 'none', 'first workout of the new cycle is normal');
  assert.equal(comebackMode('2026-03-06', '2026-03-30', {}).mode, 'reentry', 'what it used to say');
});

test('comebackFrom: a real gap inside the old cycle still counts', () => {
  // Stopped in week 6 (Feb 13); cycle ended Mar 9; new cycle Apr 20. Gap = 24 days in cycle 1 + days since Apr 20.
  const from = comebackFrom({ date: '2026-02-13', cycleStart: '2026-01-05' }, { start_date: '2026-04-20' });
  assert.equal(from, '2026-03-27');
  assert.equal(comebackMode(from, '2026-04-20', {}).mode, 'reentry');
  assert.equal(comebackMode(from, '2026-04-24', {}).mode, 'restart');
});

test('comebackFrom: last workout after the old cycle ended (late week-9 catch-up) and no idle time', () => {
  assert.equal(comebackFrom({ date: '2026-03-12', cycleStart: '2026-01-05' }, { start_date: '2026-03-12' }), '2026-03-12');
  assert.equal(comebackFrom({ date: '2026-03-12', cycleStart: '2026-01-05' }, { start_date: '2026-03-15' }), '2026-03-15');
});

test('B15: rest-day suggestion at 60+ the day after a workout, lowest priority', () => {
  assert.equal(restDaySuggested('60-69', '2026-03-02', '2026-03-03'), true);
  assert.equal(restDaySuggested('70+', '2026-03-02', '2026-03-03'), true);
  assert.equal(restDaySuggested('50-59', '2026-03-02', '2026-03-03'), false, 'under 60');
  assert.equal(restDaySuggested('60-69', '2026-03-03', '2026-03-03'), false, 'trained today: "done for today" instead');
  assert.equal(restDaySuggested('60-69', '2026-03-01', '2026-03-03'), false);
  assert.equal(restDaySuggested('60-69', null, '2026-03-03'), false);
  assert.equal(notice({ restDay: true }), 'rest_day');
  assert.equal(notice({ restDay: true, weekMode: 'consolidate', rawWeek: 4 }), 'week_mode');
  assert.equal(notice({ restDay: true, comeback: 'welcome_back' }), 'comeback');
});
