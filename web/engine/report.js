// Reporting rows for the admin list (and the same definitions the clinic report functions follow in SQL):
// active, adherence over the last 14 days, last workout, "worth a check-in call", slipping.

import { daysBetween, addDays } from './util.js';
import { weekOfCycle } from './cycle.js';
import { needsCheckInCall, isSlipping } from './adherence.js';

const DONE = new Set(['done', 'partial']);

/**
 * Planned vs completed workouts in the 14 days up to today (or since she started, if that's shorter).
 * @returns {{ planned: number, completed: number, pct: number|null }}
 */
export function recentAdherence(logs, perWeek, startDate, today, days = 14) {
  if (!startDate || daysBetween(startDate, today) < 0) return { planned: 0, completed: 0, pct: null };
  const span = Math.min(days, daysBetween(startDate, today) + 1);
  const from = addDays(today, -(span - 1));
  const planned = Math.max(1, Math.round((perWeek * span) / 7));
  const completed = new Set(logs.filter((l) => DONE.has(l.status) && l.log_date >= from && l.log_date <= today).map((l) => `${l.log_date}`)).size;
  return { planned, completed, pct: Math.min(100, Math.round((completed / planned) * 100)) };
}

/** Last completed workout date, or null. */
export const lastWorkout = (logs) => logs.filter((l) => DONE.has(l.status)).map((l) => l.log_date).sort().pop() ?? null;

/** Most recent skip reason, or null. */
export const lastSkipReason = (logs) => [...logs].filter((l) => l.status === 'skipped' && l.skip_reason)
  .sort((a, b) => (a.log_date < b.log_date ? -1 : 1)).pop()?.skip_reason ?? null;

/**
 * One row for the admin patient list.
 * @param {object} p { patient, profile, cycle|null, logs (hers), openFlags (count), perWeek, today }
 */
export function patientRow({ patient, profile, cycle, logs, openFlags = 0, perWeek, today }) {
  const last = lastWorkout(logs);
  const recent = recentAdherence(logs, perWeek, cycle?.start_date ?? patient.start_date, today);
  const week = cycle ? weekOfCycle(cycle.start_date, today) : null;
  const active = patient.status === 'active';
  return {
    id: patient.id, name: profile?.display_name ?? '—', clinicId: profile?.clinic_id ?? null, status: patient.status,
    screening: patient.screening_flag, startDate: cycle?.start_date ?? patient.start_date ?? null,
    week, thisWeek: cycle ? new Set(logs.filter((l) => l.cycle_id === cycle.id && l.week === week && DONE.has(l.status)).map((l) => l.session)).size : 0,
    perWeek, lastWorkout: last, daysSince: last ? daysBetween(last, today) : null,
    adherence: recent.pct, openFlags,
    activeNow: Boolean(last && daysBetween(last, today) <= 7),
    checkInCall: active && needsCheckInCall(last, cycle?.start_date ?? patient.start_date, today),
    slipping: active && recent.planned >= 2 && isSlipping(recent.planned, recent.completed),
    lastSkipReason: lastSkipReason(logs),
  };
}

export const SKIP_REASONS = {
  busy: 'Busy', low_energy: 'Low energy', not_feeling_well: 'Not feeling well', sore: 'Sore', travel: 'Travel', other: 'Other',
};
