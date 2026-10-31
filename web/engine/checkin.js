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
export function checkinActions({ logs, flags = [], adjustments = [], cycle, week, perWeek = 0, today, lastLogId, settings }) {
  const checks = checksFromLogs(logs, flags.filter((f) => f.type === 'pain'));
  const active = activeAdjustments({ adjustments, logs, week });
  const lighterUsed = adjustments.some((a) => a.type === 'lighter_week_next')
    || Object.values(cycle.week_modes || {}).some((m) => m?.mode === 'lighter' || m?.mode === 'deload');
  const proposed = checkinAdjustments(checks, {
    today, thisWeekChecks: checks.filter((c) => c.week === week), plannedThisWeek: perWeek, lighterWeekUsedThisCycle: lighterUsed,
    daysToNextCheckpoint: daysToNextCheckpoint(cycle.start_date, week, today),
    allPrimariesProgressedThisWeek: false,      // extra sets wait for the cycle-review step
    extraSetsUsedThisCycle: true,
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
  };
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
