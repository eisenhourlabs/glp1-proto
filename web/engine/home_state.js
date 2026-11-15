// What the home screen leads with (backlog B11). Exactly one notice, picked by priority:
//   paused → not started yet → review due → next cycle ready → comeback → week-mode note → rest day (60+) → none.
// Also the cycle label ("Week 3 of 9" / "Cycle complete") and the gap a comeback is measured over.

import { addDays, daysBetween, isSixtyPlus } from './util.js';
import { comebackMode } from './adherence.js';

export const CYCLE_WEEKS = 9;
const CYCLE_DAYS = CYCLE_WEEKS * 7;

/**
 * The cycle is complete once week 9 has ended, or every week-9 workout is done.
 * rawWeek: weekOfCycle() (0 before the start, 10+ after week 9); weekComplete: all of this week's workouts done.
 */
export const cycleComplete = (rawWeek, weekComplete) => rawWeek > CYCLE_WEEKS || (rawWeek === CYCLE_WEEKS && Boolean(weekComplete));

/** Eyebrow label for the cycle: "Week N of 9", or "Cycle complete" after week 9. */
export function cycleLabel(rawWeek, weekComplete) {
  if (cycleComplete(rawWeek, weekComplete)) return 'Cycle complete';
  return `Week ${Math.min(Math.max(rawWeek, 1), CYCLE_WEEKS)} of ${CYCLE_WEEKS}`;
}

/**
 * The date a comeback gap is measured from (Framework §13). Days with no workouts to do (after her last
 * cycle ended and before the next one started, i.e. waiting on the review) are not a gap, so the last
 * workout date is moved forward by that many days.
 * last: { date, cycleStart } of her last completed workout (cycleStart = start date of the cycle it was in), or null.
 * current: { start_date, restart? } of the active cycle (restart: it restarted after 28+ days away, B7).
 */
export function comebackFrom(last, current) {
  if (!last?.date) return null;
  if (current?.restart) return last.date;   // a restarted cycle (B7): the time away is the gap, not a wait for the review
  if (!last.cycleStart || !current?.start_date || last.cycleStart === current.start_date) return last.date;
  const ended = addDays(last.cycleStart, CYCLE_DAYS);
  const idleFrom = last.date > ended ? last.date : ended;
  const idle = Math.max(0, daysBetween(idleFrom, current.start_date));
  return addDays(last.date, idle);
}

/**
 * Today's comeback (§13, B7) from her last two completed workouts (newest first, each { date, cycleStart }), measured
 * without the days spent waiting between cycles; the earlier gap makes the second of two lighter sessions.
 */
export function comebackFor(recent, current, today, settings) {
  const [last, prev] = recent || [];
  const prior = last && prev ? { gap: daysBetween(comebackFrom(prev, { start_date: last.cycleStart }), last.date), date: last.date } : null;
  return comebackMode(comebackFrom(last, current), today, settings, prior);
}

/**
 * The one notice the home screen shows.
 * input: { paused, rawWeek, weekComplete, proposalReady, comeback: 'none'|'welcome_back'|'reentry'|'restart',
 *          weekMode, lighterByCheckin, restDay }
 * @returns {{notice: 'paused'|'upcoming'|'review_due'|'next_ready'|'comeback'|'week_mode'|'rest_day'|null,
 *            complete: boolean, label: string}}
 *   complete: the cycle has ended (review notices use it to say "You've finished this cycle").
 */
export function homeState({ paused = false, rawWeek, weekComplete = false, proposalReady = false, comeback = 'none',
  weekMode = 'build', lighterByCheckin = false, restDay = false }) {
  const complete = cycleComplete(rawWeek, weekComplete);
  const label = cycleLabel(rawWeek, weekComplete);
  const out = (notice) => ({ notice, complete, label });
  if (paused) return out('paused');
  if (rawWeek < 1) return out('upcoming');
  if (rawWeek >= CYCLE_WEEKS) return out(proposalReady ? 'next_ready' : 'review_due');
  if (comeback && comeback !== 'none') return out('comeback');
  if (lighterByCheckin || (weekMode && weekMode !== 'build')) return out('week_mode');
  if (restDay) return out('rest_day');
  return out(null);
}

/**
 * 60+ rest-day suggestion (Framework §11.2, backlog B15, Amanda packet Q17): she trained yesterday, so today is a good
 * rest day. A suggestion only: she can still start a workout.
 */
export const restDaySuggested = (ageBand, lastWorkoutDate, today) =>
  isSixtyPlus(ageBand) && Boolean(lastWorkoutDate) && daysBetween(lastWorkoutDate, today) === 1;
