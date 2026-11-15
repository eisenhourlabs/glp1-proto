// Adherence (the product's proof), forgiving streaks, comebacks and clinic flags (Framework §13; Brad's spec).

import { daysBetween } from './util.js';

export const DEFAULTS = { 'comeback.welcome_back_days': 8, 'comeback.reentry_days': 14, 'comeback.restart_days': 28 };
const cfg = (s, k) => (s && s[k] != null ? Number(s[k]) : DEFAULTS[k]);

/** Completed ÷ planned (skipped-with-reason sessions still count as planned). 0–1, or null if nothing planned. */
export function adherence(planned, completed) {
  return planned ? Math.min(1, completed / planned) : null;
}

/**
 * Forgiving streak ("never two in a row"): walk planned sessions from newest to oldest; a single miss doesn't
 * break the streak, two misses in a row do. Returns sessions completed in the current streak.
 * sessions: chronological [{ date, done: boolean }] of planned sessions up to today.
 */
export function forgivingStreak(sessions) {
  let streak = 0;
  let misses = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].done) { streak += 1; misses = 0; continue; }
    misses += 1;
    if (misses >= 2) break;
  }
  return streak;
}

/** Best forgiving streak ever (for the progress view). */
export function bestStreak(sessions) {
  let best = 0;
  for (let end = 0; end < sessions.length; end++) best = Math.max(best, forgivingStreak(sessions.slice(0, end + 1)));
  return best;
}

/**
 * Comeback mode from the gap since her last completed session (§13, backlog B7, Amanda packet Q9).
 *   8–13 days: one welcome-back session (−1 set, loads −10%).
 *   14–27 days: two lighter sessions (−1 set, loads −15%). prior = { gap, date }: the gap before her last workout and
 *     that workout's date. When that gap was 14–27 days, today is the second lighter session; its load cut only
 *     applies to exercises last done before `date` (cutBefore; see session.js cutApplies).
 *   28+ days: restart (loads −20%; the app restarts the cycle at week 1, see restartDue).
 * @returns {{mode: 'none'|'welcome_back'|'reentry'|'restart', setDelta: number, loadCutPct: number, sessions: number,
 *            second?: true, cutBefore?: string}}
 */
export function comebackMode(lastSessionDate, today, settings, prior = null) {
  const none = { mode: 'none', setDelta: 0, loadCutPct: 0, sessions: 0 };
  if (!lastSessionDate) return none;
  const gap = daysBetween(lastSessionDate, today);
  if (gap >= cfg(settings, 'comeback.restart_days')) return { mode: 'restart', setDelta: 0, loadCutPct: 20, sessions: 0 };
  if (gap >= cfg(settings, 'comeback.reentry_days')) return { mode: 'reentry', setDelta: -1, loadCutPct: 15, sessions: 2 };
  if (gap >= cfg(settings, 'comeback.welcome_back_days')) return { mode: 'welcome_back', setDelta: -1, loadCutPct: 10, sessions: 1 };
  if (prior?.gap != null && prior.gap >= cfg(settings, 'comeback.reentry_days') && prior.gap < cfg(settings, 'comeback.restart_days')) {
    return { mode: 'reentry', setDelta: -1, loadCutPct: 15, sessions: 2, second: true, cutBefore: prior.date ?? lastSessionDate };
  }
  return none;
}

/**
 * Restart the cycle at week 1 (§13 28+ days, B7)? Only for a restart-length gap that began inside the cycle's training
 * weeks (her last workout in this cycle was before week 9, or she hasn't trained in it yet), from week 2 on, and not
 * once the cycle's review plan exists. A gap after week 9 goes to the review as usual; the new cycle starts lighter.
 * lastWeekInCycle: the latest week she completed a workout in this cycle, or null.
 */
export function restartDue({ mode, rawWeek, lastWeekInCycle = null, proposalReady = false }) {
  if (mode !== 'restart' || proposalReady || rawWeek < 2) return false;
  return lastWeekInCycle == null || lastWeekInCycle < 9;
}

/** Clinic "worth a check-in call" flag: no completed workout in 7 days (enrolled, past her start date). */
export function needsCheckInCall(lastSessionDate, startDate, today, days = 7) {
  const since = lastSessionDate ?? startDate;
  return since ? daysBetween(since, today) >= days : false;
}

/** Slipping: under 50% of planned sessions over the last 2 weeks (admin view; earlier signal than the call flag). */
export function isSlipping(planned2w, completed2w) {
  return planned2w > 0 && completed2w / planned2w < 0.5;
}
