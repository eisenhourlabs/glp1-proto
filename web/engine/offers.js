// In-cycle level-up offers (Framework §5.3, backlog B6, Amanda packet Q5). After a workout, the reward screen can offer
// the next level for a pattern when she has outgrown her exercise and can't add load. Accepting swaps that pattern's
// exercises for the rest of the cycle (the new one starts with "find your weight"); declining leaves the plan unchanged
// and the pattern isn't offered again for 2 weeks.

import { resolveSlot } from './resolve.js';
import { suggestNext } from './load.js';
import { lastPerformance } from './session.js';
import { daysBetween, LOWER_PATTERNS } from './util.js';
import { LEVELUP_DEFAULTS } from './levels.js';

export const OFFER_DEFAULTS = {
  'levelup.offer_min_week': 4,      // offers only from this week of a cycle (Amanda Q5)
  'levelup.offer_decline_days': 14, // after "Not yet", no offer for the same pattern for this many days
};
const cfg = (s, k) => (s && s[k] != null ? Number(s[k]) : OFFER_DEFAULTS[k] ?? LEVELUP_DEFAULTS[k]);

/**
 * The offer rule for one pattern. recent: her last sessions on the exercise, newest last, each { allTop, rating };
 * atCeiling: she can't add load (the next suggestion is 'level-up-check'). Offer when 2 of the last 3 hit the top of
 * the range on all sets rated Good or Easy, from week `levelup.offer_min_week` (4) of the cycle, below maxLevel, at most
 * once accepted per pattern per cycle, and not within `levelup.offer_decline_days` (14) of a "Not yet".
 */
export function shouldOfferLevelUp({ level, recent = [], atCeiling = false, week = null, maxLevel = 4, declinedOn = null,
  acceptedThisCycle = false, today = null, settings } = {}) {
  if (level >= maxLevel || !atCeiling || acceptedThisCycle) return false;
  if (week == null || week < cfg(settings, 'levelup.offer_min_week')) return false;
  if (declinedOn && today && daysBetween(declinedOn, today) < cfg(settings, 'levelup.offer_decline_days')) return false;
  const good = recent.slice(-3).filter((r) => r.allTop && (r.rating === 'good' || r.rating === 'easy')).length;
  return good >= 2;
}

/** Every working set at or above the top of the range. */
export const allTop = (sets, range) => Boolean(sets?.length) && sets.every((s) => (Number(s.reps) || 0) >= range.hi);

/**
 * New picks for every cycle item of one pattern at her (new) level, in session order, keeping the other items as they
 * are and steering away from exercises already in the week (including the ones being replaced). slots: the cycle's slot rows (with withBalance applied).
 * @returns {Array<{session, slot, exercise_id, reasons, from}>} only the items whose exercise changes
 */
export function repickPattern(cycleItems, slots, pattern, profile, library) {
  const items = [...cycleItems].sort((a, b) => (a.session === b.session ? a.ord - b.ord : a.session < b.session ? -1 : 1));
  // Her current exercises for the pattern count as used too, so one she has outgrown doesn't win on variety.
  const used = new Set(items.filter((i) => i.exercise_id).map((i) => i.exercise_id));
  const out = [];
  for (const it of items.filter((i) => i.pattern === pattern)) {
    const slot = slots.find((s) => s.session === it.session && s.slot === it.slot);
    if (!slot) continue;
    const r = resolveSlot(slot, profile, library, { used });
    if (!r.exercise) continue;
    used.add(r.exercise.id);
    if (r.exercise.id !== it.exercise_id) out.push({ session: it.session, slot: it.slot, exercise_id: r.exercise.id, reasons: r.reasons, from: it.exercise_id });
  }
  return out;
}

/** The latest date of an adjustment of `type` for this pattern (ISO date), or null. */
const lastOf = (adjustments, type, pattern) => adjustments
  .filter((a) => a.type === type && a.detail?.pattern === pattern)
  .map((a) => String(a.created_at ?? a.detail?.date ?? '').slice(0, 10)).filter(Boolean).sort().pop() ?? null;

/**
 * Offers after a session (at most one per pattern, in session order).
 * lines: what she just did: [{ slot, exercise, range, measure }] (primaries and secondaries count; skipped lines left out).
 * history: { exerciseId: exercise_logs rows newest first, including this session }.
 * ctx: { week, cycleItems, slots, profile, library, ceilings: { pattern: level }, ageBand, adjustments (this cycle's),
 *        today, settings, dumbbells }
 * @returns {Array<{pattern, from, to, session, slot, exercise, next, picks}>}
 */
export function levelUpOffers(lines, history, ctx) {
  const { week, cycleItems = [], slots = [], profile, library, ceilings = {}, ageBand, adjustments = [], today, settings,
    dumbbells = [] } = ctx;
  const lib = Object.fromEntries(library.map((e) => [e.id, e]));
  const cap70 = ageBand === '70+' ? cfg(settings, 'levelup.cap_70_plus') : 4;
  const seen = new Set(); const out = [];
  for (const l of lines) {
    const ex = l.exercise; const pattern = l.slot?.pattern;
    if (!ex || !pattern || seen.has(pattern) || !['P', 'S'].includes(l.slot.role)) continue;
    seen.add(pattern);
    const level = profile.patternLevels?.[pattern] ?? 1;
    const rows = (history[ex.id] || []).filter((r) => !r.skipped && r.sets?.length);
    if (!rows.length) continue;
    const measure = l.measure === 'time' ? 'time' : 'reps';
    const { last, prevRating, older } = lastPerformance(rows, measure);
    const next = suggestNext({ loadType: ex.load_type, last, prevRating, older, range: l.range, ageBand, settings, measure,
      lower: LOWER_PATTERNS.has(pattern), available: ex.load_type === 'dumbbell' && dumbbells.length ? dumbbells : undefined });
    const recent = rows.slice(0, 3).reverse().map((r) => {
      const ws = lastPerformance([r], measure).last;
      return { allTop: allTop(ws?.sets, l.range), rating: r.rating ?? null };
    });
    const ok = shouldOfferLevelUp({ level, recent, atCeiling: next.action === 'level-up-check', week,
      maxLevel: Math.min(ceilings[pattern] ?? 4, cap70, 4), today, settings,
      declinedOn: lastOf(adjustments, 'level_offer_declined', pattern),
      acceptedThisCycle: Boolean(lastOf(adjustments, 'level_offer_accepted', pattern)) });
    if (!ok) continue;
    const up = { ...profile, patternLevels: { ...profile.patternLevels, [pattern]: level + 1 } };
    const picks = repickPattern(cycleItems, slots, pattern, up, library);
    const mine = picks.find((p) => p.session === l.slot.session && p.slot === l.slot.slot);
    const nextEx = mine && lib[mine.exercise_id];
    if (!nextEx || nextEx.level <= ex.level) continue;   // nothing harder she can do: no offer
    out.push({ pattern, from: level, to: level + 1, session: l.slot.session, slot: l.slot.slot, exercise: ex, next: nextEx, picks });
  }
  return out;
}
