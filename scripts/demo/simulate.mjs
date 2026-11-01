// Simulate a demo persona's history with the real engine: the cycle it would get, every workout (doses, suggested
// weights, find-your-weight, scaled days), check-ins, skips with reasons, adjustments, flags, the week-4/9
// decisions and, after 9 weeks, the review and her second cycle. Days are offsets from the seed day (0 = today).

import { startingLevels, startingCycle } from '../../web/engine/levels.js';
import { chooseTemplate, materializeCycle } from '../../web/engine/cycle.js';
import { roundDownToStep } from '../../web/engine/load.js';
import { baseItems, planSession, weekModeFor, weekStatus, sessionOrder } from '../../web/engine/session.js';
import { scaleToday } from '../../web/engine/readiness.js';
import { checkinActions, activeAdjustments, applyHoldAndTrim } from '../../web/engine/checkin.js';
import { cycleSummary, defaultProposal, NEXT_CYCLE } from '../../web/engine/review.js';
import { addDays, daysBetween } from '../../web/engine/util.js';
import { rng } from './personas.mjs';

const START = { dumbbell: 12, kettlebell: 18, machine: 50, cable: 35, barbell: 55, band: 2.5 };
const PATTERN_DAYS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] };
const DOC_VERSIONS = { consent: 'consent-draft-2026-10-31', waiver: 'waiver-draft-2026-10-31', screening: 'screening-draft-2026-10-31' };

export function simulatePersona(p, content, { anchor }) {
  const r = rng(p.seed ?? p.key.charCodeAt(1) * 7919);
  const off = (iso) => daysBetween(anchor, iso);                 // ISO date → day offset (≤ 0)
  const asLog = (l) => ({ id: l.ref, cycle_id: l.cycle_no, week: l.week, session: l.session, status: l.status, log_date: addDays(anchor, l.day),
    feel: l.feel, energy: l.energy, soreness: l.soreness, sore_areas: l.sore_areas, workaround_areas: l.workaround_areas, scaled: l.scaled,
    skip_reason: l.skip_reason });
  const startDate = addDays(anchor, -p.start);
  const equipment = content.setups.find((s) => s.setup === p.setup).equipment.filter((e) => e !== 'none');
  const levels = startingLevels({ experience: p.experience, check: p.check, ageBand: p.age_band });
  const patient = {
    status: p.status ?? 'active', screening_flag: p.screening_flag ?? 'none', experience: p.experience, age_band: p.age_band,
    setup: p.setup, equipment, dumbbells_available: p.dumbbells ?? [], workarounds: p.workarounds, restrictions: p.restrictions,
    floor_ok: p.floor_ok, days_per_week: p.days, session_minutes: p.minutes, goal: p.goal, goal_words: p.goal_words ?? null,
    pattern_levels: levels, workout1_check: p.check,
    preferred_days: [], low_energy_day: null,
  };
  const out = { key: p.key, login: p.login, name: p.name, story: p.story ?? null, joined_day: -p.start - 1, patient,
    start_day: p.status === 'onboarding' ? null : -p.start,
    documents: [], cycles: [], session_logs: [], exercise_logs: [], flags: [], adjustments: [], proposals: [] };
  if (patient.status === 'onboarding') return out;
  const red = patient.screening_flag === 'pause';
  out.documents = ['consent', 'screening', 'waiver'].map((t) => ({ doc_type: t, doc_version: DOC_VERSIONS[t], day: -p.start - 1,
    answers: t === 'screening' ? { chest: false, faint: red, told_not_to: false } : null }));
  if (red) { out.flags.push({ type: 'screening', detail: { reason: 'red flag at screening' }, day: -p.start, resolved: false }); out.start_day = null; return out; }

  const profile = { equipment, patternLevels: levels, workarounds: p.workarounds, restrictions: p.restrictions, floorOk: p.floor_ok };
  const settings = content.settings;
  let cycleNo = 1;
  let cycle = newCycle(startingCycle({ experience: p.experience, check: p.check }), startDate, []);
  const cap = new Map();                 // exercise id → capacity (weight for ~12 reps, or reps/seconds for bodyweight)
  const history = {};                    // exercise id → logs newest first (for suggestions)
  let logId = 0;
  const strengthGain = p.experience === 'none' ? 0.045 : 0.025;    // novices gain fast at first

  function newCycle(type, start, avoid) {
    const template = chooseTemplate(content.templates, { cycleType: type, daysPerWeek: p.days, experienced: type !== 'C1' });
    const built = materializeCycle(template, content.slots.filter((s) => s.template_id === template.template_id), profile, content.library, { minutes: p.minutes, used: avoid });
    const c = { cycle_no: cycleNo, cycle_type: type, template_id: template.template_id, start, session_minutes: p.minutes, status: 'active',
      week_modes: {}, template, items: built.sessions.flatMap((s) => s.items.map((it) => ({ session: s.session, slot: it.slot.slot, ord: it.slot.ord,
        role: it.slot.role, pattern: it.slot.pattern, exercise_id: it.exercise?.id ?? null, reasons: it.reasons }))) };
    out.cycles.push(c);
    return c;
  }
  const cycleLogs = () => out.session_logs.filter((l) => l.cycle_no === cycle.cycle_no);

  for (let d = 0; d < p.start; d++) {
    const day = addDays(startDate, d);
    const cd = daysBetween(cycle.start, day);
    if (cd >= 63 && p.start - d > 0 && cycleNo === 1 && p.key !== 'P1') {          // review + second cycle
      const summary = cycleSummary({ patient: { ...patient, pattern_levels: levels }, cycle: { ...cycle, cycle_no: cycle.cycle_no, cycle_type: cycle.cycle_type },
        template: cycle.template, logs: cycleLogs().map(asLog), exerciseLogs: out.exercise_logs.filter((e) => e.cycle_no === 1).map((e) => ({ ...e, created_at: `${addDays(anchor, e.day)}T${e.time}:00Z` })),
        flags: [], adjustments: [], library: content.library, reflection: { focus: 'Showing up every week', days: p.days, worked: ['short_workouts'], in_the_way: [] } });
      const plan = defaultProposal(summary);
      out.proposals.push({ cycle_no: 1, applied_cycle_no: 2, source: 'default', status: 'ready', output: plan, default_output: plan, final: plan,
        input_summary: summary, reflection: summary.reflection, day: off(day) });
      cycle.status = 'done';
      cycleNo = 2;
      cycle = newCycle(NEXT_CYCLE[cycle.cycle_type], day, cycle.items.map((i) => i.exercise_id).filter(Boolean));
      continue;
    }
    const week = Math.floor(daysBetween(cycle.start, day) / 7) + 1;
    if (week > 9) continue;
    const dow = daysBetween(cycle.start, day) % 7;
    if (!PATTERN_DAYS[p.days].includes(dow)) continue;
    const stopped = p.stopAfterDay != null && d > p.stopAfterDay;
    if (stopped || r() > p.adherence) {
      if (!stopped || d - p.stopAfterDay < 4) {
        if (r() < 0.5 || p.skipReason) out.session_logs.push({ ref: ++logId, cycle_no: cycle.cycle_no, week, session: null, day: off(day), status: 'skipped',
          skip_reason: p.skipReason ?? pick(r, ['busy', 'busy', 'low_energy', 'travel', 'not_feeling_well', 'sore', 'other']) });
      }
      continue;
    }
    const order = sessionOrder(cycle.template);
    const st = weekStatus(order, cycleLogs().filter((l) => l.week === week).map(asLog));
    if (!st.next) continue;
    if ((week === 4 || week === 9) && !cycle.week_modes[week]) {
      const dec = weekModeFor({ week, cycle: { week_modes: {} }, logs: cycleLogs().map(asLog), daysPerWeek: p.days, settings });
      cycle.week_modes[week] = { mode: dec.mode, consistent: dec.consistent, restReasons: dec.restReasons };
    }
    const active = activeAdjustments({ adjustments: out.adjustments.filter((a) => a.cycle_no === cycle.cycle_no).map((a) => ({ ...a, detail: { ...a.detail, after_log_id: a.detail.after_log_ref } })),
      logs: cycleLogs().map(asLog), week });
    const weekMode = cycle.week_modes[week]?.mode ?? (active.lighterWeek ? 'lighter' : 'build');
    const energy = r() < (p.lowEnergyRate ?? 0.08) ? 'low' : r() < 0.4 ? 'good' : 'ok';
    const scaled = energy === 'low' && r() < 0.65;
    let items = baseItems(cycle.items, st.next, cycle.template ? content.slots.filter((s) => s.template_id === cycle.template_id) : [], content.library);
    items = planSession(items, { week, weekMode, cycleType: cycle.cycle_type, ageBand: p.age_band, dumbbells: p.dumbbells ?? [], history, settings });
    if (active.holdAndTrim) items = applyHoldAndTrim(items);
    if (scaled) items = scaleToday(items, settings);

    const id = ++logId;
    let hardCount = 0;
    for (const it of items) {
      const ex = it.exercise;
      const lt = ex.load_type;
      const time = it.measure === 'time';
      if (!cap.has(ex.id)) cap.set(ex.id, lt === 'bodyweight' || time ? (time ? 28 : 14) * (0.8 + 0.2 * p.strength) : (START[lt] ?? 10) * p.strength * (1 + 0.15 * (ex.level - 2)));
      const c = cap.get(ex.id);
      const target = it.suggestion.targetReps ?? it.range.hi;
      let weight = null;
      if (lt !== 'bodyweight') {
        weight = it.weight ?? (lt === 'band' ? Math.max(1, Math.min(5, Math.floor(c))) : roundDownToStep(lt, c * 0.8, { available: lt === 'dumbbell' && p.dumbbells?.length ? p.dumbbells : undefined }));
      }
      let reps;
      let rating;
      if (time) { reps = Math.round(Math.min(it.range.hi + 5, c)); rating = reps >= it.range.hi + 3 ? 'easy' : reps >= it.range.lo ? 'good' : 'hard'; }
      else {
        // reps she could do with ~2 left in the tank at this weight
        const can = lt === 'bodyweight' ? c : lt === 'band' ? 12 + (c - weight) * 3 : 12 + ((c - weight) / c) * 10;
        reps = Math.max(4, Math.min(Math.round(can), target));
        rating = can >= target + 3 ? 'easy' : can >= target - 0.5 ? 'good' : 'hard';
      }
      if (r() < p.hardRate) { rating = 'hard'; reps = Math.max(4, reps - 1); }
      if (rating === 'hard') hardCount += 1;
      const sets = Array.from({ length: it.dose.sets }, (_, k) => {
        const n = k === it.dose.sets - 1 && rating === 'hard' ? Math.max(3, reps - 1) : reps;
        return time ? { seconds: n, ...(weight != null ? { weight } : {}) } : { reps: n, ...(weight != null ? { weight } : {}) };
      });
      const clock = `${String(17 + (d % 3)).padStart(2, '0')}:${String(10 + (out.exercise_logs.length % 50)).padStart(2, '0')}`;
      const log = { log_ref: id, cycle_no: cycle.cycle_no, slot: it.slot.slot, exercise_id: ex.id, sets, rating, skipped: false, day: off(day), time: clock };
      out.exercise_logs.push(log);
      (history[ex.id] ??= []).unshift({ sets, rating, skipped: false });
      cap.set(ex.id, c * (1 + strengthGain * (0.6 + r() * 0.8)));
    }
    const feel = hardCount >= Math.max(3, Math.ceil(items.length * 0.4)) || r() < p.hardRate / 2 ? 'too_hard' : r() < 0.06 ? 'too_easy' : 'right';
    const early = week <= 3 && cycle.cycle_no === 1;
    const soreRoll = r();
    const soreness = soreRoll < (early ? 0.04 : 0.01) ? 'a_lot' : soreRoll < (early ? 0.3 : 0.1) ? 'some' : 'none';
    const sore_areas = soreness === 'none' ? [] : [p.workarounds[0] ?? pick(r, ['knees', 'hips', 'low_back', 'shoulders'])];
    const workaround_areas = p.workarounds.length && r() < 0.12 ? [p.workarounds[0]] : [];
    out.session_logs.push({ ref: id, cycle_no: cycle.cycle_no, week, session: st.next, day: off(day), status: 'done', energy, scaled,
      feel, soreness, sore_areas, workaround_areas, skip_reason: null, note: null });
    if (r() < 0.012) out.flags.push({ type: 'dizzy', detail: { session_log_ref: id }, day: off(day), resolved: off(day) < -5 && r() < 0.8 });
    if (r() < 0.006) out.flags.push({ type: 'pain', detail: { session_log_ref: id, area: sore_areas[0] ?? 'knees' }, day: off(day), resolved: false });

    const acts = checkinActions({ logs: cycleLogs().map(asLog), flags: out.flags.map((f) => ({ ...f, created_at: `${addDays(anchor, f.day)}T12:00:00Z`,
      detail: { ...f.detail, session_log_id: f.detail.session_log_ref } })),
    adjustments: out.adjustments.filter((a) => a.cycle_no === cycle.cycle_no).map((a) => ({ ...a, detail: { ...a.detail, week: a.detail.week, after_log_id: a.detail.after_log_ref } })),
    cycle: { start_date: cycle.start, week_modes: cycle.week_modes }, week, perWeek: p.days, today: day, lastLogId: id, settings });
    for (const a of acts.adjustments) {
      const detail = { ...a.detail };
      if ('after_log_id' in detail) { detail.after_log_ref = detail.after_log_id; delete detail.after_log_id; }
      out.adjustments.push({ cycle_no: cycle.cycle_no, type: a.type, reason: a.reason, detail, day: off(day) });
    }
    for (const f of acts.flags) out.flags.push({ type: f.type, detail: f.detail, day: off(day), resolved: off(day) < -10 && r() < 0.7 });
  }
  out.cycles = out.cycles.map(({ template, start, ...c }) => ({ ...c, start_day: off(start) }));
  return out;
}

const pick = (r, a) => a[Math.floor(r() * a.length)];
