// After a workout (Framework §10, §12): turn session logs into check-ins, decide which bounded adjustments and
// flags a new check-in triggers (without repeating ones already in place), and which adjustments apply today.

import { daysBetween } from './util.js';
import { checkinAdjustments, patternFlags } from './adjust.js';
import { weekWindow } from './session.js';

const DONE = new Set(['done', 'partial']);

/**
 * Session logs (done/partial, with a check-in) → the check-in shape adjust.js uses, oldest first.
 * painFlags: flags of type 'pain' ({ detail: { session_log_id, area } }) to attach pain areas to their session.
 */
export function checksFromLogs(logs, painFlags = []) {
  return logs
    .filter((l) => DONE.has(l.status) && l.feel)
    .sort((a, b) => (a.log_date === b.log_date ? a.id - b.id : a.log_date < b.log_date ? -1 : 1))
    .map((l) => ({
      id: l.id, date: l.log_date, week: l.week, feel: l.feel, energy: l.energy, soreness: l.soreness ?? 'none',
      soreAreas: l.sore_areas || [], workaroundAreas: l.workaround_areas || [],
      painAreas: painFlags.filter((f) => f.detail?.session_log_id === l.id).map((f) => f.detail.area).filter(Boolean),
    }));
}

/** Days from today to the start of the next adaptive checkpoint week (4 or 9); 0 when none is left. */
export function daysToNextCheckpoint(cycleStart, week, today) {
  const cp = week < 4 ? 4 : week < 9 ? 9 : null;
  return cp ? Math.max(0, daysBetween(today, weekWindow(cycleStart, cp).from)) : 0;
}

/**
 * What a new check-in triggers. Never repeats an adjustment or flag that is already in place.
 * logs: this cycle's session logs (including the one just checked in); flags: her flags from the last 14+ days;
 * adjustments: this cycle's adjustment rows; perWeek: planned sessions a week; lastLogId: the session just checked in.
 * @returns {{ adjustments: Array<{type, reason, detail}>, flags: Array<{type, detail}>, messages: string[] }}
 */
export function checkinActions({ logs, flags = [], adjustments = [], cycle, week, perWeek = 0, today, lastLogId, settings,
  primariesProgressing = false }) {
  const checks = checksFromLogs(logs, flags.filter((f) => f.type === 'pain'));
  const active = activeAdjustments({ adjustments, logs, week });
  // A lighter week already scheduled for next week answers this week's trigger; only an earlier one makes this a second.
  const lighterUsed = adjustments.some((a) => a.type === 'lighter_week_next' && a.detail?.week !== week + 1)
    || Object.values(cycle.week_modes || {}).some((m) => m?.mode === 'lighter' || m?.mode === 'deload');
  const proposed = checkinAdjustments(checks, {
    today, thisWeekChecks: checks.filter((c) => c.week === week), plannedThisWeek: perWeek, lighterWeekUsedThisCycle: lighterUsed,
    daysToNextCheckpoint: daysToNextCheckpoint(cycle.start_date, week, today),
    allPrimariesProgressedThisWeek: primariesProgressing,
    extraSetsUsedThisCycle: adjustments.some((a) => a.type === 'extra_secondary_sets'),
  });

  const out = { adjustments: [], flags: [], messages: [] };
  const recentFlag = (pred) => flags.some((f) => f.type === 'pattern' && daysBetween(f.created_at.slice(0, 10), today) <= 14 && pred(f.detail || {}));
  for (const p of proposed) {
    if (p.type === 'hold_and_trim' && !active.holdAndTrim) {
      out.adjustments.push({ type: p.type, reason: p.reason, detail: { sessions: p.sessions, after_log_id: lastLogId } });
      out.messages.push(p.message);
    }
    if (p.type === 'lighter_week_next' && !adjustments.some((a) => a.type === p.type && a.detail?.week === week + 1)) {
      out.adjustments.push({ type: p.type, reason: p.reason, detail: { week: week + 1 } });
      out.messages.push(p.message);
    }
    if (p.type === 'extra_secondary_sets' && week < 8) {   // week 9 is the transition week: no extra sets there
      out.adjustments.push({ type: p.type, reason: p.reason, detail: { week: week + 1, sets: p.sets, slots: p.slots } });
      out.messages.push(p.message);
    }
    if (p.type === 'admin_flag' && !recentFlag((d) => d.reason === p.reason)) {
      out.flags.push({ type: 'pattern', detail: { reason: p.reason, week } });
    }
  }
  for (const pf of patternFlags(checks, today, settings)) {
    if (!recentFlag((d) => d.area === pf.area)) out.flags.push({ type: 'pattern', detail: { reason: 'area_repeat', ...pf } });
  }
  return out;
}

/**
 * Adjustments in force for today's session: hold_and_trim lasts for N completed sessions after the one that
 * triggered it; lighter_week_next makes its week lighter.
 */
export function activeAdjustments({ adjustments = [], logs = [], week }) {
  const doneAfter = (id) => logs.filter((l) => DONE.has(l.status) && l.id > id).length;
  return {
    holdAndTrim: adjustments.some((a) => a.type === 'hold_and_trim' && doneAfter(a.detail?.after_log_id ?? 0) < (a.detail?.sessions ?? 3)),
    lighterWeek: adjustments.some((a) => a.type === 'lighter_week_next' && a.detail?.week === week),
    extraSets: adjustments.some((a) => a.type === 'extra_secondary_sets' && a.detail?.week === week),
  };
}

/**
 * "All primaries progressing" for the too-easy rule (§12, backlog B8): this week she logged at least one primary,
 * and every primary she logged (not skipped) was rated Good or Easy. rows: [{ role, rating, skipped }].
 */
export function primariesProgressing(rows = []) {
  const p = rows.filter((r) => r.role === 'P' && !r.skipped);
  return p.length > 0 && p.every((r) => r.rating === 'good' || r.rating === 'easy');
}

// Typical hard-set credit of each pattern toward the major muscle groups (same table as scripts/content_check.py).
export const PATTERN_MUSCLES = {
  SQ: { Quads: 1, Glutes: 0.5 }, HI: { Glutes: 1, Hamstrings: 1 }, SL: { Quads: 1, Glutes: 0.5 },
  HP: { Chest: 1, Shoulders: 0.5 }, VP: { Shoulders: 1 }, HR: { 'Upper back': 1, Lats: 0.5 }, VR: { Lats: 1, 'Upper back': 0.5 },
};

/**
 * Which secondary slots get the extra set in a "too easy" week (§12, B8): the first 2 secondaries (by order) of each
 * session, +1 set each, skipping any that would take a major muscle group's weekly hard sets past the §7.1 ceiling
 * (12 in C1–C2, 14 in C3). week: her week; slotsBySession: { session: [slot, …] } as she does them this week.
 * @returns {Set<string>} keys "session:slot"
 */
export function extraSetSlots(slotsBySession, { week, cycleType, settings, perSession = 2 }) {
  const ceiling = Number(settings?.[cycleType === 'C3' ? 'volume.ceiling_c3' : 'volume.ceiling_c1_c2'] ?? (cycleType === 'C3' ? 14 : 12));
  const i = Math.min(Math.max(week, 1), 8) - 1;
  const load = {};
  const credit = (slot, n) => { for (const [m, c] of Object.entries(PATTERN_MUSCLES[slot.pattern] || {})) load[m] = (load[m] ?? 0) + n * c; };
  for (const list of Object.values(slotsBySession)) for (const s of list) if (s.role !== 'O') credit(s, Number(s.sets_by_week[i]));
  const keys = new Set();
  for (const [session, list] of Object.entries(slotsBySession)) {
    const sec = list.filter((s) => s.role === 'S').sort((a, b) => a.ord - b.ord);
    let added = 0;
    for (const s of sec) {
      if (added >= perSession) break;
      const fits = Object.entries(PATTERN_MUSCLES[s.pattern] || {}).every(([m, c]) => (load[m] ?? 0) + c <= ceiling);
      if (!fits) continue;
      credit(s, 1); keys.add(`${session}:${s.slot}`); added += 1;
    }
  }
  return keys;
}

/** Week modes the extra sets apply in: not lighter, light or deload weeks (a consolidate week only holds weights). */
export const extraSetsAllowed = (weekMode) => ['build', 'normal', 'consolidate'].includes(weekMode);

/** +1 set on the slots extraSetSlots() picked, for today's session. */
export function applyExtraSets(items, keys, session) {
  return items.map((it) => (keys.has(`${session}:${it.slot.slot}`)
    ? { ...it, extraSet: true, dose: { ...it.dose, sets: it.dose.sets + 1 } } : it));
}

/** Hold and trim (§12): no load increases, −1 set on secondaries (min 1). */
export function applyHoldAndTrim(items) {
  return items.map((it) => {
    let out = it;
    if (it.suggestion?.action === 'increase' && it.lastWeight != null) {
      out = { ...out, weight: it.lastWeight, suggestion: { ...it.suggestion, action: 'hold', note: 'Same weight for now while we ease things for a few sessions.' } };
    }
    if (it.slot.role === 'S') out = { ...out, dose: { ...out.dose, sets: Math.max(1, out.dose.sets - 1) } };
    return out;
  });
}
