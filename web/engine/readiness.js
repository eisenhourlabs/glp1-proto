// Same-day adjustments (Framework §9, §10): "Scale today", work-around swaps, soreness.
// Items are a session's resolved slots enriched with today's dose and suggested weight:
//   { slot, exercise, dose: {sets, reps, rir, ...}, weight, ... }

import { resolveSlot } from './resolve.js';
import { scaleTodayWeight } from './load.js';

/**
 * Scale today: primaries same exercises and sets, ~10% lighter at RIR 3; secondaries −1 set (min 1);
 * optional slots dropped; finishers as written. Counts fully (the caller logs it as 'scaled').
 */
export function scaleToday(items, settings) {
  return items
    .filter((it) => it.slot.role !== 'O')
    .map((it) => {
      const role = it.slot.role;
      if (role === 'P') {
        return { ...it, scaled: true, dose: { ...it.dose, rir: '3' },
          weight: scaleTodayWeight(it.exercise?.load_type, it.weight, { settings }) };
      }
      if (role === 'S') return { ...it, scaled: true, dose: { ...it.dose, sets: Math.max(1, it.dose.sets - 1) } };
      return { ...it, scaled: true };
    });
}

/** "Make it easier": re-resolve every slot one level down. */
export function makeEasier(items, profile, library, opts = {}) {
  const used = new Set();
  return items.map((it) => {
    const r = resolveSlot(it.slot, profile, library, { ...opts, used, levelDelta: -1 });
    if (r.exercise) used.add(r.exercise.id);
    const changed = r.exercise && it.exercise && r.exercise.id !== it.exercise.id;
    return { ...it, ...r, weight: changed ? null : it.weight, easier: true };
  });
}

/**
 * Work-around chips for today (§9): any exercise loading a chosen area at 2 is swapped for the best same-pattern
 * option loading it ≤ 1; if none exists the slot is skipped for today.
 * @returns {{items, swaps: Array<{slot, from, to, area}>}}
 */
export function applyWorkarounds(items, areas, profile, library, opts = {}) {
  if (!areas?.length) return { items, swaps: [] };
  const used = new Set(items.map((it) => it.exercise?.id).filter(Boolean));
  const swaps = [];
  const out = items.map((it) => {
    const hit = it.exercise && areas.find((a) => (it.exercise.area_load?.[a] ?? 0) > 1);
    if (!hit) return it;
    used.delete(it.exercise.id);
    const r = resolveSlot(it.slot, profile, library, { ...opts, used, todayWorkarounds: areas });
    swaps.push({ slot: it.slot.slot, from: it.exercise.id, to: r.exercise?.id ?? null, area: hit });
    if (r.exercise) used.add(r.exercise.id);
    return r.exercise ? { ...it, ...r, weight: null, swappedFor: hit } : { ...it, exercise: null, skippedFor: hit, reasons: r.reasons };
  });
  return { items: out, swaps };
}

/**
 * Soreness from the last session (§10 "sore"): for exercises that load a sore area at all, hold the load and
 * take one set off secondaries. Exercises stay the same; soreness is normal early on.
 */
export function applySoreness(items, soreAreas) {
  if (!soreAreas?.length) return { items, touched: [] };
  const touched = [];
  const out = items.map((it) => {
    const hit = it.exercise && soreAreas.find((a) => (it.exercise.area_load?.[a] ?? 0) >= 1);
    if (!hit) return it;
    touched.push(it.slot.slot);
    const sets = it.slot.role === 'S' ? Math.max(1, it.dose.sets - 1) : it.dose.sets;
    return { ...it, holdLoad: true, dose: { ...it.dose, sets }, soreArea: hit };
  });
  return { items: out, touched };
}
