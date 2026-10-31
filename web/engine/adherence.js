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
 * Comeback mode from the gap since her last completed session (§13).
 * @returns {{mode: 'none'|'welcome_back'|'reentry'|'restart', setDelta: number, loadCutPct: number, sessions: number}}
 */
export function comebackMode(lastSessionDate, today, settings) {
  if (!lastSessionDate) return { mode: 'none', setDelta: 0, loadCutPct: 0, sessions: 0 };
  const gap = daysBetween(lastSessionDate, today);
  if (gap >= cfg(settings, 'comeback.restart_days')) return { mode: 'restart', setDelta: 0, loadCutPct: 20, sessions: 0 };
  if (gap >= cfg(settings, 'comeback.reentry_days')) return { mode: 'reentry', setDelta: -1, loadCutPct: 15, sessions: 2 };
  if (gap >= cfg(settings, 'comeback.welcome_back_days')) return { mode: 'welcome_back', setDelta: -1, loadCutPct: 10, sessions: 1 };
  return { mode: 'none', setDelta: 0, loadCutPct: 0, sessions: 0 };
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
