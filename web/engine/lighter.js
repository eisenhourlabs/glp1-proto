// Her own choices for a rough patch (backlog B9, Amanda packet Q6, Q7):
//   "Rough week?": the lighter version for 7 days (the full-deload dose, §7.2), counts fully, no reason asked, at most
//   `lighter.self_max_per_cycle` (2) times a cycle; after that the copy suggests talking with her clinic.
//   "Short version": the two main lifts and one finisher (about 15 minutes), counts fully.

import { addDays } from './util.js';

export const LIGHTER_DEFAULTS = { 'lighter.self_max_per_cycle': 2, 'lighter.self_days': 7 };
const cfg = (s, k) => (s && s[k] != null ? Number(s[k]) : LIGHTER_DEFAULTS[k]);

/** Week modes that are already lighter: the switch isn't offered on top of them. */
const ALREADY_LIGHTER = new Set(['lighter', 'light', 'deload']);

/** The 7 days a lighter week covers when she switches today: { from, to } (inclusive ISO dates). */
export function selfLighterRange(today, settings) {
  return { from: today, to: addDays(today, cfg(settings, 'lighter.self_days') - 1) };
}

/**
 * Where her lighter-week switch stands this cycle. adjustments: this cycle's rows (type 'self_lighter_week' with
 * detail { from, to }); weekMode: this week's mode before her choice.
 * @returns {{ active: boolean, until: string|null, used: number, max: number, canStart: boolean, usedUp: boolean }}
 */
export function selfLighterState({ adjustments = [], today, weekMode = 'build', settings }) {
  const mine = adjustments.filter((a) => a.type === 'self_lighter_week' && a.detail?.from);
  const current = mine.find((a) => a.detail.from <= today && today <= a.detail.to);
  const max = cfg(settings, 'lighter.self_max_per_cycle');
  const used = mine.length;
  return { active: Boolean(current), until: current?.detail.to ?? null, used, max,
    usedUp: !current && used >= max, canStart: !current && used < max && !ALREADY_LIGHTER.has(weekMode) };
}

/**
 * The short version of a session (Amanda Q7): the first two primaries and one finisher, in order. At 60+ the finisher
 * is a balance one when the session has it (balance twice a week, B4). Sets, weights and effort are unchanged.
 */
export function shortVersion(items, { ageBand } = {}) {
  const sorted = [...items].sort((a, b) => a.slot.ord - b.slot.ord);
  const primaries = sorted.filter((it) => it.slot.role === 'P').slice(0, 2);
  const finishers = sorted.filter((it) => it.slot.role === 'F');
  const sixty = ageBand === '60-69' || ageBand === '70+';
  const fin = (sixty && finishers.find((it) => it.slot.pattern === 'BA')) || finishers[0];
  const keep = new Set([...primaries, fin].filter(Boolean));
  return sorted.filter((it) => keep.has(it)).map((it) => ({ ...it, short: true }));
}
