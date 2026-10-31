// Check-in driven adjustments (Framework §12) and pattern flags (§10). Deterministic and bounded; every result
// carries the reason so it can be logged and shown to her as encouragement.
//
// checks: chronological array of post-session check-ins:
//   { date, feel: 'too_easy'|'right'|'too_hard', energy: 'low'|'ok'|'good', soreAreas: [], workaroundAreas: [],
//     painAreas: [], soreness: 'none'|'some'|'a_lot' }

import { daysBetween } from './util.js';

export const DEFAULTS = { 'checkin.pattern_flag_count': 3, 'checkin.pattern_flag_days': 14 };
const cfg = (s, k) => (s && s[k] != null ? Number(s[k]) : DEFAULTS[k]);

/**
 * Adjustments for what comes next.
 * ctx: { today, thisWeekChecks: [...], lighterWeekUsedThisCycle: bool, daysToNextCheckpoint: number,
 *        allPrimariesProgressedThisWeek: bool, extraSetsUsedThisCycle: bool }
 * @returns {Array<{type, reason, sessions?, sets?}>}
 *   type: 'hold_and_trim' (next 3 sessions: no load increases, −1 set on secondaries)
 *       | 'lighter_week_next' | 'extra_secondary_sets' | 'admin_flag'
 */
export function checkinAdjustments(checks, ctx = {}) {
  const out = [];
  const last2 = checks.slice(-2);
  if (last2.length === 2 && last2.every((c) => c.feel === 'too_hard')) {
    out.push({ type: 'hold_and_trim', sessions: 3, reason: 'too_hard_twice',
      message: 'We eased things after two tough sessions. That’s smart training, not a step back.' });
  }
  const week = ctx.thisWeekChecks ?? [];
  const hardShare = week.length ? week.filter((c) => c.feel === 'too_hard').length / week.length : 0;
  const lowEnergy = week.filter((c) => c.energy === 'low').length;
  if (week.length && (hardShare >= 0.5 || lowEnergy >= 2)) {
    if (ctx.lighterWeekUsedThisCycle) {
      out.push({ type: 'admin_flag', reason: 'second_lighter_week_trigger' });
    } else if ((ctx.daysToNextCheckpoint ?? 99) > 14) {
      out.push({ type: 'lighter_week_next', reason: hardShare >= 0.5 ? 'too_hard_week' : 'low_energy_week',
        message: 'Next week is lighter so you can recharge. It still counts fully.' });
    }
  }
  if (week.length && week.every((c) => c.feel === 'too_easy') && ctx.allPrimariesProgressedThisWeek && !ctx.extraSetsUsedThisCycle) {
    out.push({ type: 'extra_secondary_sets', sets: 1, slots: 2, reason: 'too_easy_week',
      message: 'You’re ready for a bit more. We added a set to a couple of exercises.' });
  }
  return out;
}

/**
 * Pattern flags (§10): the same body area flagged (soreness 'a lot', work-around, or pain) 3 times in 14 days
 * → admin review. Any pain in those flags marks it as a pain flag (problem path).
 * @returns {Array<{area, count, pain: boolean}>}
 */
export function patternFlags(checks, today, settings) {
  const days = cfg(settings, 'checkin.pattern_flag_days');
  const need = cfg(settings, 'checkin.pattern_flag_count');
  const recent = checks.filter((c) => daysBetween(c.date, today) <= days && daysBetween(c.date, today) >= 0);
  const counts = new Map();
  for (const c of recent) {
    const areas = new Set([
      ...(c.soreness === 'a_lot' ? c.soreAreas ?? [] : []),
      ...(c.workaroundAreas ?? []),
      ...(c.painAreas ?? []),
    ]);
    for (const a of areas) {
      const cur = counts.get(a) ?? { area: a, count: 0, pain: false };
      cur.count += 1;
      cur.pain ||= (c.painAreas ?? []).includes(a);
      counts.set(a, cur);
    }
  }
  return [...counts.values()].filter((x) => x.count >= need);
}

/** Signals for the adaptive week decision (cycle.adaptiveWeekMode) from the last 14 days of check-ins. */
export function restSignals(checks, today, { stalledPrimaries = 0 } = {}) {
  const recent = checks.filter((c) => { const d = daysBetween(c.date, today); return d >= 0 && d <= 14; });
  return {
    tooHard: recent.filter((c) => c.feel === 'too_hard').length,
    lowEnergy: recent.filter((c) => c.energy === 'low').length,
    flags: recent.filter((c) => c.soreness === 'a_lot' || (c.workaroundAreas ?? []).length).length,
    stalledPrimaries,
  };
}
