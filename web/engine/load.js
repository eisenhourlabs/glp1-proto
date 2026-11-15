// Load prescription (Framework §8): "find your weight", double progression, increments by load type and age band.
// Weights are in pounds. Bands use a resistance level (1 = extra light … 5 = extra heavy). Bodyweight progresses by
// reps, then tempo, then a level-up offer.

import { isSixtyPlus } from './util.js';

export const DB_STEPS = [2, 3, 5, 8, 10, 12, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100];
export const KB_STEPS = [9, 13, 18, 26, 35, 44, 53, 62, 70];
export const BAND_LABELS = ['', 'Extra light', 'Light', 'Medium', 'Heavy', 'Extra heavy'];
export const DEFAULTS = {
  'progression.max_load_jump_pct': 10,
  'progression.max_increments_per_week': 2,
  'progression.double_jump_extra_reps': 3,
  'progression.drop_pct': 10,
  'scale_today.load_cut_pct': 10,
  'band.sessions_per_step': 2,
};
const set = (settings, k) => (settings && settings[k] != null ? Number(settings[k]) : DEFAULTS[k]);

/** The weights she can load: her own dumbbell set (opts.available) applies to dumbbells only. */
function weightsFor(loadType, opts = {}) {
  if (loadType === 'dumbbell' && opts.available?.length) return [...opts.available].sort((a, b) => a - b);
  return stepList(loadType);
}

function stepList(loadType) {
  if (loadType === 'dumbbell') return DB_STEPS;
  if (loadType === 'kettlebell') return KB_STEPS;
  if (loadType === 'band') return [1, 2, 3, 4, 5];
  return null;
}

/** Linear increment for stack / bar loads (Framework §8.3). */
function linearStep(loadType, { lower, ageBand }) {
  const fifty = ageBand && ageBand !== '40-49';
  if (loadType === 'machine' || loadType === 'cable') return 5;
  if (loadType === 'barbell') return lower ? (fifty ? 5 : 10) : (fifty ? 2.5 : 5);
  return null;
}

/**
 * Move a weight n steps up (n > 0) or down (n < 0). Returns the same weight when it can't move
 * (bodyweight, or the end of the dumbbell rack). `available` optionally limits the steps (e.g. home dumbbells).
 */
export function step(loadType, weight, n, opts = {}) {
  if (loadType === 'bodyweight' || weight == null || n === 0) return weight;
  const list = weightsFor(loadType, opts);
  if (list) {
    let i = list.findIndex((w) => w >= weight - 1e-9);
    if (i === -1) i = list.length - 1;
    if (list[i] > weight + 1e-9 && n > 0) n -= 1;   // weight between steps: first step up lands on the next one
    return list[Math.max(0, Math.min(list.length - 1, i + n))];
  }
  const inc = linearStep(loadType, opts);
  return Math.max(0, Math.round((weight + n * inc) * 2) / 2);
}

/** Round down to a weight she can actually load (used by Scale today / drops). */
export function roundDownToStep(loadType, weight, opts = {}) {
  const list = weightsFor(loadType, opts);
  if (list) return [...list].reverse().find((w) => w <= weight + 1e-9) ?? list[0];
  const inc = linearStep(loadType, opts) || 1;
  return Math.floor(weight / inc) * inc;
}

/**
 * First exposure: she did set 1 at `weight` and rated it. Weight for the remaining sets (Framework §8.1).
 * rating: 'easy' | 'good' | 'hard'; muchEasier: she said she could have done many more.
 */
export function findYourWeight({ loadType, weight, rating, muchEasier = false, lower = false, ageBand, available }) {
  const opts = { lower, ageBand, available };
  if (rating === 'easy') return { weight: step(loadType, weight, muchEasier ? 2 : 1, opts), note: 'A little heavier for the next sets.' };
  if (rating === 'hard') return { weight: step(loadType, weight, -1, opts), note: 'A little lighter for the next sets.' };
  return { weight, note: 'That’s your weight. Same for the next sets.' };
}

/**
 * Double progression (Framework §8.2). Given the last session on this exercise, suggest the next one.
 * last: { weight, sets: [{reps}], rating: 'easy'|'good'|'hard' }   prevRating: rating the time before (or null)
 * range: { lo, hi }   weekMode: 'build' | 'normal' | 'consolidate' | 'lighter' | 'light' | 'deload'
 * Returns { weight, action: 'find'|'increase'|'hold'|'decrease'|'progress-bodyweight'|'level-up-check', targetReps, note }
 */
export function suggestNext({ loadType, last, prevRating = null, older = null, range, ageBand, lower = false, weekMode = 'build',
  earlyFoundations = false, settings, available }) {
  const opts = { lower, ageBand, available };
  if (!last || !last.sets?.length) {
    return { weight: null, action: 'find', targetReps: range.hi, note: 'Find your weight: pick one you could lift about 12–15 times and do 10.' };
  }
  if (loadType === 'band') return bandNext({ last, older, range, weekMode, settings });
  const reps = last.sets.map((s) => Number(s.reps) || 0);
  const w = last.weight;
  const allTop = reps.every((r) => r >= range.hi);
  const anyBelow = reps.some((r) => r < range.lo);
  const holdWeek = ['consolidate', 'lighter', 'light', 'deload'].includes(weekMode);
  const nextReps = Math.min(range.hi, Math.max(range.lo, Math.min(...reps) + 1));

  if (anyBelow || (last.rating === 'hard' && prevRating === 'hard')) {
    if (loadType === 'bodyweight') return { weight: w, action: 'level-down-check', targetReps: range.lo, note: 'Let’s make this one a little easier.' };
    const byPct = roundDownToStep(loadType, w * (1 - set(settings, 'progression.drop_pct') / 100), opts);
    const oneDown = step(loadType, w, -1, opts);
    return { weight: Math.min(byPct, oneDown), action: 'decrease', targetReps: range.lo, note: 'A little lighter this time. That’s smart training.' };
  }
  if (holdWeek) return { weight: w, action: 'hold', targetReps: nextReps, note: 'Holding steady this week.' };
  if (last.rating === 'hard') return { weight: w, action: 'hold', targetReps: nextReps, note: 'Same weight. Aim for smooth reps.' };

  // Big fixed jumps (kettlebells, bands) and 60+ progress reps first (Framework §8.3).
  const repsFirst = isSixtyPlus(ageBand) || loadType === 'kettlebell' || loadType === 'band';
  const readyToAdd = repsFirst ? reps.every((r) => r >= range.hi + 2) : allTop;
  if (!readyToAdd) {
    return { weight: w, action: 'hold', targetReps: repsFirst && allTop ? range.hi + 2 : nextReps,
      note: allTop ? 'Same weight. A couple more reps, then we add weight.' : 'Same weight. Try one more rep per set.' };
  }
  if (loadType === 'bodyweight') {
    return { weight: w, action: 'progress-bodyweight', targetReps: range.hi, note: 'Make it harder: lower slowly for 3 seconds, or try the next level.' };
  }
  const extra = set(settings, 'progression.double_jump_extra_reps');
  const twoSteps = last.rating === 'easy' && !earlyFoundations && !isSixtyPlus(ageBand) && reps.every((r) => r >= range.hi + extra);
  let next = step(loadType, w, twoSteps ? 2 : 1, opts);
  const cap = set(settings, 'progression.max_load_jump_pct') / 100;
  if (twoSteps && (next - w) / w > cap) next = step(loadType, w, 1, opts);   // S9: never jump >10% when a smaller step exists
  if (next === w) return { weight: w, action: 'level-up-check', targetReps: range.hi, note: 'You’ve outgrown this weight. Ready for the next level?' };
  return { weight: next, action: 'increase', targetReps: range.lo, note: 'Nice work. A little heavier this time.' };
}

/**
 * Bands (backlog B3, Amanda packet Q8). A band step is a >30% jump, so she stays on a band longer and makes it harder
 * with tempo first. Stages on one band: 0 = normal → 1 = lower for 3 seconds → 2 = lower for 3 seconds and pause for
 * 1 second → next band at stage 0. Stage 0 moves on at the top of the range + 2 reps, stages 1–2 at the top of the
 * range, all sets, rated Good or Easy, in `band.sessions_per_step` (2) sessions in a row at that band and stage.
 * A band only drops after two sessions in a row below the range (or Hard twice), so it never flips straight back.
 * last / older: her last two logs ({ weight, sets: [{reps}], rating, stage }), newest first.
 */
export function bandNext({ last, older = null, range, weekMode = 'build', settings }) {
  const w = last.weight;
  const stage = last.stage ?? 0;
  const reps = last.sets.map((x) => Number(x.reps) || 0);
  const below = (l) => l && l.weight === w && l.sets.some((x) => (Number(x.reps) || 0) < range.lo);
  const nextReps = Math.min(range.hi, Math.max(range.lo, Math.min(...reps) + 1));
  const out = (o) => ({ weight: w, stage, targetReps: nextReps, ...o });
  if ((below(last) && below(older)) || (last.rating === 'hard' && older?.rating === 'hard' && older.weight === w)) {
    const down = step('band', w, -1);
    if (down === w) return out({ action: 'hold', stage: 0, targetReps: range.lo, note: 'Same band, normal speed. Aim for smooth reps.' });
    return { weight: down, stage: 0, action: 'decrease', targetReps: range.lo, note: 'A lighter band this time. That’s smart training.' };
  }
  if (below(last)) return out({ action: 'hold', targetReps: range.lo, note: 'Same band. Aim for the bottom of the range today.' });
  if (['consolidate', 'lighter', 'light', 'deload'].includes(weekMode)) return out({ action: 'hold', note: 'Holding steady this week.' });
  if (last.rating === 'hard') return out({ action: 'hold', note: 'Same band. Aim for smooth reps.' });
  const target = stage === 0 ? range.hi + 2 : range.hi;
  const met = (l) => l && l.weight === w && (l.stage ?? 0) === stage && (l.rating === 'good' || l.rating === 'easy')
    && l.sets.length && l.sets.every((x) => (Number(x.reps) || 0) >= target);
  const need = set(settings, 'band.sessions_per_step');
  const hits = met(last) ? (need <= 1 || met(older) ? need : 1) : 0;
  if (hits < need) {
    return out({ action: 'hold', targetReps: stage === 0 ? Math.min(range.hi + 2, Math.max(range.lo, Math.min(...reps) + 1)) : nextReps,
      note: stage === 0 ? 'Same band. A couple more reps, then we make it harder.' : BAND_TEMPO[stage] });
  }
  if (stage < 2) return { weight: w, stage: stage + 1, action: 'tempo', targetReps: range.lo, note: 'Same band, slower now.' };
  const up = step('band', w, 1);
  if (up === w) return out({ action: 'level-up-check', note: 'You’ve outgrown the heaviest band. Ready for the next level?' });
  return { weight: up, stage: 0, action: 'increase', targetReps: range.lo, note: 'Next band up, normal speed again. Nice work.' };
}

/** How each band stage reads in the dose line. */
export const BAND_TEMPO = ['', 'Lower for 3 seconds on every rep.', 'Lower for 3 seconds and pause for 1 second at the hardest point.'];

/** A load cut by pct (comebacks, §13), rounded down to a weight she can actually load. */
export function reduceLoad(loadType, weight, pct, opts = {}) {
  if (weight == null || loadType === 'bodyweight' || !pct) return weight;
  return roundDownToStep(loadType, weight * (1 - pct / 100), opts);
}

/** "Scale today" load for a primary (Framework §9): about 10% lighter, rounded down to a loadable weight. */
export function scaleTodayWeight(loadType, weight, { settings, ...opts } = {}) {
  return reduceLoad(loadType, weight, set(settings, 'scale_today.load_cut_pct'), opts);
}
