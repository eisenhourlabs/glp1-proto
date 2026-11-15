// Speed-run checks. Violations are Framework rules the engine must always keep (the run should report none).
// Watch items are known gaps that sprint 1 is fixing; they are counted so each PR's before/after shows them move.

import { equipOk } from '../../web/engine/resolve.js';
import { slotDose } from '../../web/engine/cycle.js';
import { step } from '../../web/engine/load.js';
import { LOWER_PATTERNS } from '../../web/engine/util.js';

const COMPOUND = new Set(['SQ', 'HI', 'SL', 'HP', 'VP', 'HR', 'VR']);
const num = (settings, k, d) => (settings && settings[k] != null ? Number(settings[k]) : d);
const minRir = (rir) => Math.min(...String(rir).split('-').map(Number).filter((n) => !Number.isNaN(n)));

export const RULES = {
  level_above: 'Exercise above her level for that pattern (Framework §5.2)',
  cap_70: '70+ above level 2 (§5.2)',
  restriction: 'Exercise her provider asked her to avoid (§11)',
  floor: 'Floor exercise below level 3 when she is not comfortable on the floor (§16)',
  workaround: 'Loads a work-around area at 2 (§9)',
  equipment: 'Needs equipment she does not have (§11)',
  rir: 'Compound exercise below the minimum reps in reserve (§6)',
  sets_above: 'More sets than the template writes for that week (§7)',
  load_jump: 'Load jump over the maximum when a smaller step exists (§8.3, S9)',
  increments: 'More load increases in a week than allowed (§8.3)',
  comeback_missed: 'A gap that should start a comeback did not (§13)',
  review_invalid: 'Cycle review plan fails the validator (§14)',
  level_step: 'A level change of more than one step at a review (§5.3)',
  level_ceiling: 'A level-up above her setup or library ceiling (§5.3, B1)',
  extra_set: 'An extra set outside a secondary slot (§12, B8)',
  balance_60: 'A full 60+ week with fewer than 2 workouts containing balance (§4, B4)',
};
export const WATCH = {
  levelup_not_applied: 'Level-up earned but never applied (B1, B6)',
  level1_repeat: 'Same level-1 exercise twice in a week (B5, Amanda Q5)',
  band_flip: 'Band goes up then straight back down (B3)',
  too_easy_no_extra_sets: 'A "too easy" week did not add sets (B8)',
  review_flag: 'Cycle review plan needs admin review',
  no_option: 'Template slot with no exercise that fits her (slot skipped)',
};

/** Rules for one exercise line of a session. ctx: { cycle, profile, areas, ageBand, settings, comeback, gapDays, cw } */
export function lineChecks(l, ctx) {
  const ex = l.exercise; const out = [];
  const add = (rule, detail) => out.push({ rule, detail });
  const level = ctx.cycle.levels[l.pattern] ?? 1;
  if (ex.level > level) add('level_above', `${l.pattern} level ${ex.level} > her ${level}`);
  if (ctx.ageBand === '70+' && ex.level > 2) add('cap_70', `level ${ex.level}`);
  const restricted = (ex.restrictions || []).filter((r) => ctx.profile.restrictions.includes(r));
  if (restricted.length) add('restriction', restricted.join(', '));
  if (ex.floor && !ctx.profile.floorOk && level < 3) add('floor', `level ${level}`);
  for (const a of new Set([...ctx.profile.workarounds, ...ctx.areas])) if ((ex.area_load?.[a] ?? 0) > 1) add('workaround', a);
  if (!equipOk(ex.equipment, ['none', ...ctx.cycle.equipment])) add('equipment', ex.equipment);
  if ((l.role === 'P' || l.role === 'S') && COMPOUND.has(l.pattern) && minRir(l.rir) < num(ctx.settings, 'effort.min_rir_compound', 2)) add('rir', String(l.rir));
  const written = slotDose(l.written, ctx.cw, 'build', ctx.settings).sets + (l.extraSet ? 1 : 0);
  if (l.sets > written) add('sets_above', `${l.sets} > ${written}`);
  if (l.extraSet && l.role !== 'S') add('extra_set', `${l.role} slot`);
  if (l.weight != null && l.lastWeight != null && l.weight > l.lastWeight && !l.found) {
    const opts = { lower: LOWER_PATTERNS.has(l.pattern), ageBand: ctx.ageBand,
      available: l.load_type === 'dumbbell' && ctx.cycle.dumbbells?.length ? ctx.cycle.dumbbells : undefined };
    const one = step(l.load_type, l.lastWeight, 1, opts);
    const pct = (l.weight - l.lastWeight) / l.lastWeight;
    if (l.weight > one && pct > num(ctx.settings, 'progression.max_load_jump_pct', 10) / 100) add('load_jump', `${l.lastWeight} → ${l.weight}`);
  }
  return out;
}

/** Session-level: a gap inside one cycle long enough for a welcome back must get one. */
export function sessionChecks({ gapDays, comeback, settings }) {
  if (gapDays != null && gapDays >= num(settings, 'comeback.welcome_back_days', 8) && comeback === 'none') {
    return [{ rule: 'comeback_missed', detail: `${gapDays} days since her last workout` }];
  }
  return [];
}

/** Week-level rules and watch items. */
export function weekChecks(wk, settings, { ageBand } = {}) {
  const violations = []; const watch = [];
  const at = { cycle: wk.cycle, week: wk.g };
  const incs = new Map();
  const l1 = new Map();
  for (const s of wk.sessions) {
    for (const l of s.lines) {
      if (l.action === 'increase' && l.weight > (l.lastWeight ?? Infinity)) incs.set(l.id, (incs.get(l.id) ?? 0) + 1);
      if (l.level === 1) l1.set(l.id, new Set([...(l1.get(l.id) ?? []), s.letter]));
    }
  }
  const maxInc = num(settings, 'progression.max_increments_per_week', 2);
  for (const [id, n] of incs) if (n > maxInc) violations.push({ ...at, rule: 'increments', exercise: id, detail: `${n} increases` });
  for (const [id, letters] of l1) if (letters.size > 1) watch.push({ ...at, rule: 'level1_repeat', exercise: id, detail: `sessions ${[...letters].join(', ')}` });
  const sixty = ageBand === '60-69' || ageBand === '70+';
  const withBalance = wk.sessions.filter((s) => s.lines.some((l) => l.pattern === 'BA')).length;
  if (sixty && wk.sessions.length >= 2 && wk.sessions.length >= wk.planned && withBalance < 2 && !wk.sessions.some((s) => s.swaps?.length)) {
    violations.push({ ...at, rule: 'balance_60', detail: `${withBalance} of ${wk.sessions.length} workouts had balance` });
  }
  const checks = wk.sessions.map((s) => s.checkin.feel);
  if (checks.length && checks.every((f) => f === 'too_easy') && !wk.adjustments.some((a) => a.type === 'extra_secondary_sets')) {
    watch.push({ ...at, rule: 'too_easy_no_extra_sets', detail: `${checks.length} "too easy" check-ins` });
  }
  return { violations, watch };
}

/** Across a persona's whole run: band weights that go up and straight back down (not a scaled or comeback day). */
export function seriesChecks(weeks) {
  const watch = []; const seq = new Map();
  for (const wk of weeks) for (const s of wk.sessions || []) for (const l of s.lines) {
    if (l.load_type !== 'band' || l.weight == null || s.scaled || s.comeback !== 'none') continue;
    const prev = seq.get(l.id) ?? [];
    prev.push({ w: l.weight, date: s.date, cycle: wk.cycle, g: wk.g });
    seq.set(l.id, prev);
    const n = prev.length;
    if (n >= 3 && prev[n - 2].w > prev[n - 3].w && prev[n - 1].w < prev[n - 2].w) {
      watch.push({ rule: 'band_flip', cycle: wk.cycle, week: wk.g, exercise: l.id, detail: `${prev[n - 3].w} → ${prev[n - 2].w} → ${prev[n - 1].w}` });
    }
  }
  return watch;
}

/** The review plan through the same validator the server uses, plus the level-up limits (§5.3, B1). */
export function reviewChecks(validation, at, { proposal, levels = {}, ceilings = {} } = {}) {
  const out = validation.errors.map((e) => ({ ...at, rule: 'review_invalid', detail: e }));
  for (const c of proposal?.level_changes ?? []) {
    const from = levels[c.pattern] ?? 1;
    if (Math.abs(c.change) !== 1) out.push({ ...at, rule: 'level_step', detail: `${c.pattern} ${c.change}` });
    if (c.change > 0 && from + 1 > (ceilings[c.pattern] ?? 4)) out.push({ ...at, rule: 'level_ceiling', detail: `${c.pattern} ${from} → ${from + 1} (ceiling ${ceilings[c.pattern]})` });
  }
  return out;
}
export const reviewWatch = (validation, at) => validation.review.map((r) => ({ ...at, rule: 'review_flag', detail: r }));
