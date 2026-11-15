// Cycle mechanics (Framework §7): week of cycle, the adaptive week-4 / week-9 decision (§7.2a), weekly dose,
// the session queue, and materializing a cycle (exercise per slot, fixed for the cycle).

import { daysBetween, parseRange, isSixtyPlus } from './util.js';
import { resolveSession } from './resolve.js';

export const DEFAULTS = {
  'adaptive.consistent_pct': 75,
  'adaptive.too_hard_count': 2,
  'adaptive.low_energy_count': 2,
  'adaptive.flag_count': 3,
  'adaptive.stalled_primaries': 2,
  'lighter_week.set_cut_pct': 45,
  'balance.min_sessions_60_plus': 2,
};
const cfg = (settings, k) => (settings && settings[k] != null ? Number(settings[k]) : DEFAULTS[k]);

/** Week 1–9 of a cycle that started on cycleStart (ISO date). 0 before the start; 10+ after the transition week. */
export function weekOfCycle(cycleStart, today) {
  const d = daysBetween(cycleStart, today);
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}

/** Completed ≥ X% of planned sessions (§7.2a "consistent"). */
export function isConsistent(planned, completed, settings) {
  if (!planned) return false;
  return (completed / planned) * 100 >= cfg(settings, 'adaptive.consistent_pct');
}

/**
 * "Needs rest" signals over the last 2 weeks (§7.2a). Any one is enough.
 * signals: { tooHard, lowEnergy, flags, stalledPrimaries } (counts)
 */
export function needsRest(signals = {}, settings) {
  const reasons = [];
  if ((signals.tooHard ?? 0) >= cfg(settings, 'adaptive.too_hard_count')) reasons.push('too_hard');
  if ((signals.lowEnergy ?? 0) >= cfg(settings, 'adaptive.low_energy_count')) reasons.push('low_energy');
  if ((signals.flags ?? 0) >= cfg(settings, 'adaptive.flag_count')) reasons.push('soreness_flags');
  if ((signals.stalledPrimaries ?? 0) >= cfg(settings, 'adaptive.stalled_primaries')) reasons.push('stalled');
  return reasons;
}

/**
 * The adaptive week decision (§7.2a). Weeks other than 4 and 9 are 'build'.
 * @returns {{mode: string, consistent: boolean, restReasons: string[]}}
 *   week 4: 'build' | 'consolidate' | 'lighter'      week 9: 'normal' | 'light' | 'deload'
 */
export function adaptiveWeekMode({ week, planned, completed, signals, settings }) {
  const consistent = isConsistent(planned, completed, settings);
  const restReasons = consistent ? needsRest(signals, settings) : [];
  let mode = 'build';
  if (week === 4) mode = !consistent ? 'build' : restReasons.length ? 'lighter' : 'consolidate';
  if (week === 9) mode = !consistent ? 'normal' : restReasons.length ? 'deload' : 'light';
  return { mode, consistent, restReasons };
}

/** Patient-facing explanation of a week-4/9 decision. */
export function weekModeMessage(mode) {
  return {
    consolidate: 'You’ve been consistent. This week we hold your weights steady and make every rep smooth.',
    lighter: 'You’ve trained consistently and your body’s been working hard, so this week is lighter. That’s how strength sticks.',
    light: 'Great cycle. This week is a little lighter while we look back and plan your next one.',
    deload: 'You’ve earned an easier week. Lighter sessions now help the next cycle go even better.',
    normal: 'Let’s use this week to get back in rhythm, then plan your next cycle together.',
    build: '',
  }[mode] ?? '';
}

/**
 * Dose for one slot in a given week (1–9) and week mode.
 * Week 9 starts from week 8's prescription. Lighter / deload: sets cut ~45% (min 1), RIR 3–4.
 * Light: −1 set (min 1), RIR 3. Consolidate/normal/build: as written (load module handles "no increases").
 */
export function slotDose(slot, week, mode = 'build', settings) {
  const i = Math.min(Math.max(week, 1), 8) - 1;
  let sets = Number(slot.sets_by_week[i]);
  let rir = String(slot.rir_by_week[i]);
  const reps = parseRange(slot.reps_by_week[i]);
  const time = slot.time_range_sec ? parseRange(slot.time_range_sec) : null;
  if (mode === 'lighter' || mode === 'deload') {
    sets = Math.max(1, Math.round(sets * (1 - cfg(settings, 'lighter_week.set_cut_pct') / 100)));
    rir = '3-4';
  } else if (mode === 'light') {
    sets = Math.max(1, sets - 1);
    rir = '3';
  }
  return { sets, reps, rir, time, restSec: slot.rest_sec };
}

/** Next session letter in this week's queue, or null when the week is done. Order follows the template. */
export function nextInQueue(sessionOrder, completedThisWeek) {
  const done = new Set(completedThisWeek);
  return sessionOrder.find((s) => !done.has(s)) ?? null;
}

/**
 * Materialize a cycle for a patient: resolve every slot once (exercise fixed for the cycle; the same pattern
 * twice in a week gets a different exercise when possible). opts.used: exercises to steer away from when
 * there's a choice (a repeated cycle type gets fresh exercises, Framework §14).
 * @returns {{templateId, sessions: Array<{session, name, items: Array<{slot, exercise, reasons}>}>, skipped: number}}
 */
export function materializeCycle(template, slots, profile, library, { minutes = 45, used: avoid = [], ageBand = null, settings } = {}) {
  const used = new Set(avoid);
  let skipped = 0;
  const all = withBalance(slots, template, { ageBand, minutes, settings });
  const sessions = template.sessions.map(({ session, name }) => {
    const own = all.filter((s) => s.template_id === template.template_id && s.session === session);
    const items = resolveSession(own, profile, library, { minutes, used });
    skipped += items.filter((it) => !it.exercise).length;
    return { session, name, items };
  });
  return { templateId: template.template_id, sessions, skipped };
}

/**
 * Balance at 60+ (Framework §4, §11.2; backlog B4, Amanda packet Q4): at least 2 sessions a week contain a balance
 * slot at her session length. Sessions that already have a balance slot that only fits a longer workout get it at
 * every length first; then sessions without one get a balance finisher (`BAL`, a copy of the template's balance slot,
 * placed after the last finisher). Deterministic, so the planner rebuilds the same slots from the cycle each day.
 * slots may hold every template's slots; only this template's change. Under 60 the slots come back unchanged.
 */
export function withBalance(slots, template, { ageBand, minutes = 45, settings } = {}) {
  if (!isSixtyPlus(ageBand)) return slots;
  const tid = template.template_id;
  const mine = (out, session) => out.filter((s) => s.template_id === tid && s.session === session);
  const fits = (out, session) => mine(out, session).some((s) => s.pattern === 'BA' && s.min_minutes <= minutes);
  const need = Math.min(cfg(settings, 'balance.min_sessions_60_plus'), template.sessions.length);
  const order = template.sessions.map((s) => s.session);
  let out = slots;
  let count = order.filter((sess) => fits(out, sess)).length;
  const source = slots.find((s) => s.template_id === tid && s.pattern === 'BA');
  if (count >= need || !source) return slots;
  for (const sess of order) {                       // 1) bring an existing balance slot forward
    if (count >= need) break;
    const ba = !fits(out, sess) && mine(out, sess).find((s) => s.pattern === 'BA');
    if (!ba) continue;
    out = out.map((s) => (s === ba ? { ...s, min_minutes: Math.min(s.min_minutes, minutes) } : s));
    count += 1;
  }
  for (const sess of order) {                       // 2) add a balance finisher
    if (count >= need) break;
    if (fits(out, sess)) continue;
    const list = mine(out, sess).sort((a, b) => a.ord - b.ord);
    const anchor = [...list].reverse().find((s) => s.role === 'F') ?? [...list].reverse().find((s) => s.role !== 'O');
    const ord = (anchor?.ord ?? 0) + 1;
    out = out.map((s) => (s.template_id === tid && s.session === sess && s.ord >= ord ? { ...s, ord: s.ord + 1 } : s));
    out = [...out, { ...source, session: sess, slot: 'BAL', ord, role: 'F', min_minutes: Math.min(30, minutes), pair_with: null }];
    count += 1;
  }
  return out;
}

/** Which template fits this patient (Framework §11.1): cycle type + days per week; 4-day only if experienced. */
export function chooseTemplate(templates, { cycleType, daysPerWeek, experienced }) {
  const days = daysPerWeek === 4 && !experienced ? 3 : daysPerWeek;
  return templates.find((t) => t.active && t.cycle_type === cycleType && t.days_per_week === days)
    ?? templates.find((t) => t.active && t.cycle_type === cycleType && t.days_per_week === 3)
    ?? null;
}
