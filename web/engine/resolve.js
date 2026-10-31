// Slot → exercise resolution (Framework §5.2, §9, §11, §16).
// Given a template slot, the patient's profile and the exercise library, pick the exercise she does,
// and say why it differs from the "ideal" pick (equipment, a work-around, a restriction or floor comfort),
// so the app can show "Swapped: no barbell in your setup" style notes.
//
// Profile shape (all fields optional except equipment):
//   { equipment: ['db','bench',…], patternLevels: {SQ: 2, …}, workarounds: ['knees'],
//     restrictions: ['overhead'], floorOk: false }

import { AREAS } from './util.js';

/** Equipment requirement: ';' separates items that are all required, '|' separates alternatives. */
export function equipOk(requirement, have) {
  const set = have instanceof Set ? have : new Set(have);
  return String(requirement || 'none')
    .split(';').filter(Boolean)
    .every((group) => group.split('|').some((alt) => alt === 'none' || set.has(alt)));
}

/**
 * Could this exercise fill a slot for this patient? Each test can be switched off (ignore.*) so we can ask
 * "what would she get without this constraint?" when explaining a swap.
 */
export function eligible(ex, ctx, ignore = {}) {
  if (!ex.active) return false;
  if (ex.level > ctx.level) return false;
  if (!ignore.equipment && !equipOk(ex.equipment, ctx.have)) return false;
  if (!ignore.restrictions && (ex.restrictions || []).some((r) => ctx.restrictions.has(r))) return false;
  if (!ignore.floor && ex.floor && !ctx.floorOk && ctx.level < 3) return false;
  if (!ignore.workarounds) {
    for (const area of ctx.workarounds) if ((ex.area_load?.[area] ?? 0) > 1) return false;
  }
  return true;
}

function rank(slot, used) {
  const prefer = slot.prefer_ids || [];
  const pIdx = (id) => { const i = prefer.indexOf(id); return i === -1 ? Infinity : i; };
  return (a, b) =>
    (pIdx(a.id) - pIdx(b.id)) ||                                   // template preference first
    ((used.has(a.id) ? 1 : 0) - (used.has(b.id) ? 1 : 0)) ||      // something not already in this week
    (b.level - a.level) ||                                         // highest level she's ready for
    a.id.localeCompare(b.id);                                      // stable
}

/** Build the filtering context for a slot. */
export function contextFor(slot, profile, opts = {}) {
  const base = profile.patternLevels?.[slot.pattern] ?? 1;
  return {
    level: Math.max(1, base + (opts.levelDelta ?? 0)),
    have: new Set(['none', ...(profile.equipment || [])]),
    restrictions: new Set(profile.restrictions || []),
    workarounds: new Set([...(profile.workarounds || []), ...(opts.todayWorkarounds || [])]),
    floorOk: Boolean(profile.floorOk),
  };
}

/**
 * Pick the exercise for one slot.
 * @returns {{exercise: object|null, level: number, reasons: Array<{type: string, area?: string, instead?: string}>}}
 *   reasons explain differences from the unconstrained pick: type 'equipment' | 'workaround' | 'restriction' | 'floor'
 *   | 'no-option' (nothing fits: the engine skips the slot, Framework §9).
 */
export function resolveSlot(slot, profile, library, opts = {}) {
  const used = opts.used ?? new Set();
  const ctx = contextFor(slot, profile, opts);
  const pool = library.filter((e) => e.pattern === slot.pattern);
  const order = rank(slot, used);
  const pick = (ignore) => pool.filter((e) => eligible(e, ctx, ignore)).sort(order)[0] ?? null;

  const chosen = pick({});
  if (!chosen) return { exercise: null, level: ctx.level, reasons: [{ type: 'no-option' }] };

  const reasons = [];
  const explain = (type, ignore) => {
    const alt = pick(ignore);
    if (alt && alt.id !== chosen.id) reasons.push({ type, instead: alt.id, ...areaOf(type, alt, ctx) });
  };
  explain('equipment', { equipment: true });
  explain('workaround', { workarounds: true });
  explain('restriction', { restrictions: true });
  explain('floor', { floor: true });
  return { exercise: chosen, level: ctx.level, reasons };
}

function areaOf(type, alt, ctx) {
  if (type !== 'workaround') return {};
  const area = AREAS.find((a) => ctx.workarounds.has(a) && (alt.area_load?.[a] ?? 0) > 1);
  return area ? { area } : {};
}

/**
 * Resolve every slot of one session that fits her session length, in order.
 * `used` is shared across the week's sessions so the same pattern gets a different exercise when possible.
 */
export function resolveSession(sessionSlots, profile, library, opts = {}) {
  const minutes = opts.minutes ?? 45;
  const used = opts.used ?? new Set();
  return [...sessionSlots]
    .filter((s) => s.min_minutes <= minutes)
    .sort((a, b) => a.ord - b.ord)
    .map((slot) => {
      const r = resolveSlot(slot, profile, library, { ...opts, used });
      if (r.exercise) used.add(r.exercise.id);
      return { slot, ...r };
    });
}

/**
 * Plain-language note for a swap (shown once under the exercise name). Equipment matching is the normal case for
 * home setups, so it is only spelled out when asked (admin view, or right after she changes her equipment).
 */
export function swapNote(reasons, { includeEquipment = false } = {}) {
  const r = reasons.find((x) => x.type !== 'no-option' && (includeEquipment || x.type !== 'equipment'));
  if (!r) return '';
  const area = (r.area || '').replace(/_/g, ' ').replace('upper back neck', 'upper back and neck').replace('elbows wrists', 'elbows and wrists');
  switch (r.type) {
    case 'equipment': return 'Matched to the equipment you have.';
    case 'workaround': return area ? `Giving your ${area} a break. Here's your swap.` : "Here's your swap.";
    case 'restriction': return 'Chosen to fit what your provider asked you to avoid.';
    case 'floor': return 'A version that stays off the floor.';
    default: return '';
  }
}
