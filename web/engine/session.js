// Today's session (Framework §6, §7.2a, §8, §13): the week queue, the week-4/9 decision, and each exercise's dose and
// suggested weight from her history. Pure: dates come in as ISO strings, history comes in as rows.
//
// Pipeline the app runs for a session:
//   baseItems → (makeEasier) → applyWorkarounds → [fetch history for the final exercises] → planSession
//   → applyHold(applySoreness(...)) → (scaleToday)

import { LOWER_PATTERNS, addDays } from './util.js';
import { slotDose, nextInQueue, adaptiveWeekMode } from './cycle.js';
import { suggestNext, reduceLoad, BAND_LABELS } from './load.js';
import { contextFor, eligible } from './resolve.js';

const DONE = new Set(['done', 'partial']);

/** Session letters in template order. */
export const sessionOrder = (template) => template.sessions.map((s) => s.session);

/** A cycle's stored items for one session → resolved items ({slot, exercise, reasons}), in order. Empty slots dropped. */
export function baseItems(cycleItems, session, slots, library) {
  const bySlot = Object.fromEntries(slots.filter((s) => s.session === session).map((s) => [s.slot, s]));
  const lib = Object.fromEntries(library.map((e) => [e.id, e]));
  return cycleItems
    .filter((i) => i.session === session && i.exercise_id && bySlot[i.slot] && lib[i.exercise_id])
    .sort((a, b) => a.ord - b.ord)
    .map((i) => ({ slot: bySlot[i.slot], exercise: lib[i.exercise_id], reasons: i.reasons || [] }));
}

/** This week's queue: which sessions are done and which is next (§13: the week is a queue; leftovers drop off). */
export function weekStatus(order, weekLogs) {
  const done = order.filter((s) => weekLogs.some((l) => l.session === s && DONE.has(l.status)));
  return { done, next: nextInQueue(order, done), complete: done.length >= order.length };
}

/** One session per day (§13). */
export const trainedOn = (logs, day) => logs.some((l) => l.log_date === day && DONE.has(l.status));

/** The dates a cycle week covers: [from, to) as ISO dates. */
export const weekWindow = (cycleStart, week) => ({ from: addDays(cycleStart, (week - 1) * 7), to: addDays(cycleStart, week * 7) });

/**
 * The week mode for weeks 4 and 9 (§7.2a), decided from the two weeks before it. Other weeks are 'build'.
 * logs: session_logs rows of this cycle; flagCount: flags raised in those two weeks.
 * A decision already stored on the cycle (cycle.week_modes) wins, so it never changes mid-week.
 */
export function weekModeFor({ week, cycle, logs, daysPerWeek, flagCount = 0, settings }) {
  if (week !== 4 && week !== 9) return { mode: 'build', stored: true };
  const saved = cycle.week_modes?.[String(week)];
  if (saved?.mode) return { ...saved, stored: true };
  const window = logs.filter((l) => l.week === week - 1 || l.week === week - 2);
  const done = window.filter((l) => DONE.has(l.status));
  const signals = {
    tooHard: done.filter((l) => l.feel === 'too_hard').length,
    lowEnergy: window.filter((l) => l.energy === 'low').length,
    flags: flagCount,
  };
  const r = adaptiveWeekMode({ week, planned: daysPerWeek * 2, completed: done.length, signals, settings });
  return { ...r, stored: false };
}

/** Working sets of a logged exercise: the sets at the final weight (the anchor after "find your weight"). */
export function workingSets(sets, measure) {
  const rows = (sets || []).map((s) => ({ weight: s.weight ?? null, reps: Number(measure === 'time' ? s.seconds : s.reps) || 0 }));
  if (!rows.length) return null;
  const w = rows[rows.length - 1].weight;
  return { weight: w, sets: rows.filter((r) => r.weight === w).map(({ reps }) => ({ reps })) };
}

/** Her last two non-skipped logs for one exercise (newest first) → suggestNext's {last, prevRating}. */
export function lastPerformance(history, measure) {
  const usable = (history || []).filter((l) => !l.skipped && l.sets?.length);
  if (!usable.length) return { last: null, prevRating: null };
  const ws = workingSets(usable[0].sets, measure);
  return { last: ws && { ...ws, rating: usable[0].rating ?? null }, prevRating: usable[1]?.rating ?? null };
}

/** How a weight reads to her. */
export function weightLabel(loadType, weight) {
  if (loadType === 'bodyweight' || weight == null) return '';
  if (loadType === 'band') return `${BAND_LABELS[weight] ?? 'Band'} band`;
  return `${weight} lb`;
}

function firstNote(loadType, range, measure) {
  if (measure === 'time') return `Hold for ${range.lo}–${range.hi} seconds, breathing the whole time.`;
  if (loadType === 'bodyweight') return `Do ${range.lo}–${range.hi} reps, stopping with 2–3 good reps left.`;
  if (loadType === 'band') return `Pick a band that lets you do ${range.lo}–${range.hi} reps with 2–3 left in the tank.`;
  return null;   // suggestNext's "find your weight" note
}

/**
 * Dose and suggested weight for each item.
 * ctx: { week, weekMode, cycleType, ageBand, dumbbells: number[], comeback: comebackMode(), history: {exerciseId: rows},
 *        settings }
 * Returns items with: dose {sets, reps, rir, time, restSec}, range, measure, weight (suggested; null = she picks),
 * lastWeight, suggestion {action, targetReps, note}.
 */
export function planSession(items, ctx) {
  const { week, weekMode = 'build', cycleType, ageBand, dumbbells = [], comeback, history = {}, settings } = ctx;
  return items.map((it) => {
    const ex = it.exercise;
    const measure = ex.measure === 'time' ? 'time' : 'reps';
    let dose = slotDose(it.slot, week, weekMode, settings);
    if (comeback?.setDelta) dose = { ...dose, sets: Math.max(1, dose.sets + comeback.setDelta) };
    const range = measure === 'time' && dose.time ? dose.time : dose.reps;
    const { last, prevRating } = lastPerformance(history[ex.id], measure);
    const s = suggestNext({
      loadType: ex.load_type, last, prevRating, range, ageBand, weekMode, settings,
      lower: LOWER_PATTERNS.has(it.slot.pattern), earlyFoundations: cycleType === 'C1' && week <= 3,
      available: ex.load_type === 'dumbbell' && dumbbells.length ? dumbbells : undefined,
    });
    let weight = s.weight;
    let note = (s.action === 'find' && firstNote(ex.load_type, range, measure)) || s.note;
    if (measure === 'time' && s.action === 'hold') note = 'Same as last time. Try holding a few seconds longer.';
    if (s.action === 'progress-bodyweight') note = 'Make it harder today: lower slowly for 3 seconds on every rep.';
    if (comeback && comeback.mode !== 'none' && weight != null) {
      weight = reduceLoad(ex.load_type, weight, comeback.loadCutPct, { ageBand, available: dumbbells.length ? dumbbells : undefined });
      note = 'Welcome back! A little lighter today so you can ease back in.';
    }
    return { ...it, dose, range, measure, weight, last, lastWeight: last?.weight ?? null,
      suggestion: { action: s.action, targetReps: s.targetReps, note } };
  });
}

/** Soreness hold (§10): where applySoreness marked holdLoad, don't add weight today. */
export function applyHold(items) {
  return items.map((it) => (it.holdLoad && it.suggestion?.action === 'increase' && it.lastWeight != null
    ? { ...it, weight: it.lastWeight, suggestion: { ...it.suggestion, action: 'hold', note: 'Same weight today while that area settles.' } }
    : it));
}

/** "Last time: 15 lb × 12, 11" / "Last time: 12, 12 reps" / "Last time: 30, 30 s" — or '' with no history. */
export function lastTimeText(loadType, last, measure) {
  if (!last?.sets?.length) return '';
  const reps = last.sets.map((s) => s.reps).join(', ');
  const w = weightLabel(loadType, last.weight);
  const unit = measure === 'time' ? ' s' : ' reps';
  return `Last time: ${w ? `${w} × ${reps}${measure === 'time' ? ' s' : ''}` : `${reps}${unit}`}`;
}

/** Other exercises she could do in this slot today (her "Swap" button): same pattern, eligible, best first. */
export function swapOptions(slot, profile, library, currentId, { limit = 4, todayWorkarounds = [] } = {}) {
  const c = contextFor(slot, profile, { todayWorkarounds });
  return library
    .filter((e) => e.pattern === slot.pattern && e.id !== currentId && eligible(e, c))
    .sort((a, b) => (b.level - a.level) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Summary for the finish screen: exercises done, sets done, and whether anything was skipped. */
export function sessionSummary(exerciseLogs) {
  const done = exerciseLogs.filter((l) => !l.skipped && l.sets?.length);
  return { exercises: done.length, sets: done.reduce((n, l) => n + l.sets.length, 0), skipped: exerciseLogs.length - done.length };
}
