import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, defaultDays } from '../web/shared/ics.js';

test('buildIcs: weekly on her days, first event on/after the start date, with an alert', () => {
  const ics = buildIcs({ days: [5, 1, 3], time: '17:30', startDate: '2026-11-04', minutes: 45, title: 'Strength workout; today',
    url: 'https://example.org/app/', uid: 'u1-reminder@example', stamp: '20261031T120000Z' });
  assert.ok(ics.includes('DTSTART:20261104T173000\r\n'), 'Wednesday the 4th');
  assert.ok(ics.includes('DTEND:20261104T181500\r\n'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\r\n'));
  assert.ok(ics.includes('SUMMARY:Strength workout\\; today'));
  assert.ok(ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:PT0M'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
});

test('buildIcs: start date before her first day moves forward; no days is an error', () => {
  const ics = buildIcs({ days: [6], time: '08:05', startDate: '2026-11-02', title: 'x', url: 'u', uid: 'u', stamp: 's' });
  assert.ok(ics.includes('DTSTART:20261107T080500'));
  assert.throws(() => buildIcs({ days: [], time: '08:00', startDate: '2026-11-02', title: 'x', url: 'u', uid: 'u', stamp: 's' }));
});

test('defaultDays', () => {
  assert.deepEqual(defaultDays(2), [2, 5]);
  assert.deepEqual(defaultDays(3), [1, 3, 5]);
  assert.deepEqual(defaultDays(4), [1, 2, 4, 5]);
});
