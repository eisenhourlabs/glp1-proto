// End-of-cycle review (Framework §14): the de-identified cycle summary the AI sees, the library options it may pick
// from, the deterministic default proposal (used when the AI is off, fails, or is waiting for review), the default
// recap, and applying a proposal to her levels. Validation lives in review_validate.js.

import { PATTERNS, clamp } from './util.js';
import { contextFor, eligible } from './resolve.js';
import { weeklyCounts, streaks, strengthWins } from './progress.js';
import { workingSets } from './session.js';

export const NEXT_CYCLE = { C1: 'C2', C2: 'C3', C3: 'C3' };
export const CYCLE_NAMES = { C1: 'Foundations', C2: 'Building', C3: 'Strong & Consistent' };
export const PATTERN_NAMES = {
  SQ: 'squat', HI: 'hip hinge', SL: 'single-leg', HP: 'push', VP: 'overhead press', HR: 'row', VR: 'pulldown',
  CA: 'carry', CO: 'core', BA: 'balance', HA: 'hip strength', AR: 'arms',
};
const DONE = new Set(['done', 'partial']);
const count = (arr) => arr.reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});

/** The engine's profile shape from a patients row (same as the app's engineProfile). */
export const reviewProfile = (p) => ({
  equipment: p.equipment || [], patternLevels: p.pattern_levels || {}, workarounds: p.workarounds || [],
  restrictions: p.restrictions || [], floorOk: Boolean(p.floor_ok),
});

/**
 * De-identified summary of one cycle: no name, email, dates of birth, free text or clinic. Counts, levels, trends.
 * @param {object} d { patient, cycle, template, logs, exerciseLogs, flags, adjustments, library, reflection }
 *   reflection: { worked: [], in_the_way: [], adjust: string, focus: string, days?: number, minutes?: number }
 */
export function cycleSummary({ patient, cycle, template, logs, exerciseLogs = [], flags = [], adjustments = [], library, reflection = {} }) {
  const perWeek = template?.days_per_week ?? patient.days_per_week ?? 3;
  const weeks = weeklyCounts(logs, 9, perWeek);
  const s = streaks(weeks, 10);
  const planned = weeks.reduce((n, w) => n + w.planned, 0);
  const done = logs.filter((l) => DONE.has(l.status));
  const lib = Object.fromEntries(library.map((e) => [e.id, e]));
  const patterns = {};
  for (const p of PATTERNS) {
    const mine = exerciseLogs.filter((l) => lib[l.exercise_id]?.pattern === p && !l.skipped && l.sets?.length)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    if (!mine.length && !(p in (patient.pattern_levels || {}))) continue;
    const ex = mine.length ? lib[mine[mine.length - 1].exercise_id] : null;
    const measure = ex?.measure === 'time' ? 'time' : 'reps';
    const first = mine.length ? workingSets(mine[0].sets, measure) : null;
    const last = mine.length ? workingSets(mine[mine.length - 1].sets, measure) : null;
    const top = (ws) => (ws ? Math.max(...ws.sets.map((x) => x.reps)) : null);
    patterns[p] = {
      level: patient.pattern_levels?.[p] ?? 1,
      sessions: mine.length,
      exercises: [...new Set(mine.map((l) => l.exercise_id))],
      ratings: count(mine.map((l) => l.rating).filter(Boolean)),
      first: first ? { weight: first.weight, best: top(first) } : null,
      last: last ? { weight: last.weight, best: top(last) } : null,
      load_type: ex?.load_type ?? null,
    };
  }
  const checked = done.filter((l) => l.feel);
  const area = (field) => count(done.flatMap((l) => l[field] || []));
  return {
    cycle: { number: cycle.cycle_no, type: cycle.cycle_type, template: cycle.template_id, days_per_week: perWeek,
      session_minutes: cycle.session_minutes, week_modes: Object.fromEntries(Object.entries(cycle.week_modes || {}).map(([w, m]) => [w, m?.mode])) },
    patient: {
      age_band: patient.age_band, experience: patient.experience, goal: patient.goal, setup: patient.setup,
      equipment: patient.equipment || [], restrictions: patient.restrictions || [], workarounds: patient.workarounds || [],
      floor_ok: Boolean(patient.floor_ok), dumbbells: patient.dumbbells_available || [],
    },
    adherence: { planned, completed: weeks.reduce((n, w) => n + w.done, 0), by_week: weeks.map((w) => w.done),
      pct: planned ? Math.round((weeks.reduce((n, w) => n + w.done, 0) / planned) * 100) : 0,
      best_streak: s.best, scaled: done.filter((l) => l.scaled).length,
      skips: count(logs.filter((l) => l.status === 'skipped' && l.skip_reason).map((l) => l.skip_reason)) },
    checkins: { count: checked.length, feel: count(checked.map((l) => l.feel)),
      low_energy: logs.filter((l) => l.energy === 'low').length,
      sore_a_lot: count(done.filter((l) => l.soreness === 'a_lot').flatMap((l) => l.sore_areas || [])),
      sore_any: area('sore_areas'), workarounds: area('workaround_areas') },
    flags: count(flags.map((f) => f.type)),
    adjustments: count(adjustments.map((a) => a.type)),
    patterns,
    strength_wins: strengthWins(exerciseLogs, library, 3).map((w) => ({ exercise: w.name, from: w.from, to: w.to })),
    reflection: { worked: reflection.worked || [], in_the_way: reflection.in_the_way || [], adjust: reflection.adjust || null,
      focus: reflection.focus || null, days: reflection.days ?? null },
  };
}

/** Exercises she could be given per pattern next cycle (her equipment, restrictions, floor rule; level ≤ current + 1). */
export function libraryOptions(profile, library, perPattern = 8) {
  const out = {};
  for (const p of PATTERNS) {
    const level = (profile.patternLevels?.[p] ?? 1) + 1;
    const ctx = contextFor({ pattern: p }, { ...profile, patternLevels: { ...profile.patternLevels, [p]: level } });
    const opts = library.filter((e) => e.pattern === p && eligible(e, ctx))
      .sort((a, b) => (b.level - a.level) || a.id.localeCompare(b.id)).slice(0, perPattern)
      .map((e) => ({ id: e.id, name: e.name, level: e.level }));
    if (opts.length) out[p] = opts;
  }
  return out;
}

/** The default recap: specific, warm, no weight talk. */
export function defaultRecap(summary, nextType, days) {
  const a = summary.adherence;
  const parts = [`You finished ${a.completed} workout${a.completed === 1 ? '' : 's'} in Cycle ${summary.cycle.number}.`];
  if (a.best_streak >= 3) parts.push(`Your best streak was ${a.best_streak} in a row.`);
  const w = summary.strength_wins[0];
  if (w) parts.push(`Biggest win: ${w.exercise}, from ${w.from} to ${w.to}.`);
  else if (a.completed) parts.push('You’ve been building the habit, and that’s what strength is made of.');
  parts.push(nextType === summary.cycle.type
    ? `Next up: another round of ${CYCLE_NAMES[nextType]} with fresh energy, ${days} days a week.`
    : `Next up: ${CYCLE_NAMES[nextType]}, ${days} days a week.`);
  parts.push('Keep showing up. That’s what makes you stronger.');
  return parts.join(' ');
}

/**
 * The deterministic default (Framework §14): next cycle type in sequence, levels unchanged, the template's default
 * exercises, her own days per week, her chosen focus.
 */
export function defaultProposal(summary) {
  const nextType = NEXT_CYCLE[summary.cycle.type] ?? summary.cycle.type;
  const days = summary.reflection.days ?? summary.cycle.days_per_week;
  return {
    cycle_type: nextType, days_per_week: days, level_changes: [], swaps: [],
    recap: defaultRecap(summary, nextType, days), focus: summary.reflection.focus ?? 'Keep building the habit', flags: [],
  };
}

/** Her levels after a proposal's level changes (each ±1, clamped 1–4). */
export function applyLevelChanges(levels, changes = []) {
  const out = { ...levels };
  for (const c of changes) out[c.pattern] = clamp((out[c.pattern] ?? 1) + Math.sign(c.change), 1, 4);
  return out;
}

/**
 * Slots for the next cycle with her swaps applied: the first slot (in session order) of each swapped pattern prefers
 * the chosen exercise. Other slots are untouched.
 */
export function slotsWithSwaps(slots, swaps = []) {
  const done = new Set();
  return [...slots].sort((a, b) => (a.session === b.session ? a.ord - b.ord : a.session < b.session ? -1 : 1)).map((s) => {
    const sw = swaps.find((x) => x.pattern === s.pattern);
    if (!sw || done.has(s.pattern)) return s;
    done.add(s.pattern);
    return { ...s, prefer_ids: [sw.exercise_id, ...(s.prefer_ids || [])] };
  });
}

/** Plain-language lines for the patient: what changes next cycle. */
export function proposalLines(p, library) {
  const lib = Object.fromEntries(library.map((e) => [e.id, e]));
  const lines = [];
  for (const c of p.level_changes || []) {
    lines.push(`${PATTERN_NAMES[c.pattern] ?? c.pattern}: ${c.change > 0 ? 'one level up' : 'one level easier'}${c.evidence ? `. ${c.evidence}` : ''}`);
  }
  for (const s of p.swaps || []) lines.push(`New exercise for ${PATTERN_NAMES[s.pattern] ?? s.pattern}: ${lib[s.exercise_id]?.name ?? s.exercise_id}`);
  return lines;
}
