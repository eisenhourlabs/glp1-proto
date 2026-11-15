// The weekly streak shown on the progress, reward and review screens (backlog C6). Same "never two in a row" rule as
// the workout streak in adherence.js, counted in WEEKS: a week counts when she finished every planned workout in it;
// one missed week is forgiven, two missed weeks in a row start the count again. A week still in progress is neither a
// hit nor a miss until it is complete. (Kept out of progress.js so the ai-cycle-review function bundle is unchanged.)

import { forgivingStreak, bestStreak } from './adherence.js';

/**
 * weeks: [{ week, planned, done }] as from weeklyCounts(); currentWeek: the week she is in (10 once the cycle is over).
 * @returns {{ current: number, best: number }} weeks in the current streak / in her best streak
 */
export function weekStreaks(weeks, currentWeek) {
  const ended = weeks
    .filter((w) => w.week < currentWeek || w.done >= w.planned)
    .map((w) => ({ done: w.done >= w.planned }));
  return { current: forgivingStreak(ended), best: bestStreak(ended) };
}
