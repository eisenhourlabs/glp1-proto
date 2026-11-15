// Persona speed-run (backlog E1): made-up patients through the real engine, no database. Each persona follows a
// scripted calendar (sessions, check-ins, gaps, bad weeks, equipment changes) across as many cycles as fit in the
// run, including the end-of-cycle review the app runs when the AI is off. Every session goes through the same
// engine calls the patient app makes, in the same order (web/patient/home.js, today.js, checkin.js, api.js).
// Pure: content and personas in, a result object out. The CLI (scripts/speedrun.mjs) writes the reports.

import { startingLevels, startingCycle } from '../../web/engine/levels.js';
import { levelUpOffers, OFFER_DEFAULTS } from '../../web/engine/offers.js';
import { chooseTemplate, materializeCycle, weekOfCycle, weekModeMessage } from '../../web/engine/cycle.js';
import { findYourWeight, roundDownToStep, BAND_LABELS } from '../../web/engine/load.js';
import { swapNote } from '../../web/engine/resolve.js';
import { restartDue } from '../../web/engine/adherence.js';
import { comebackFor } from '../../web/engine/home_state.js';
import { planSession, applyHold, weekModeFor, weekWindow } from '../../web/engine/session.js';
import { applyWorkarounds, applySoreness, scaleToday, standingAreas } from '../../web/engine/readiness.js';
import { checkinActions, activeAdjustments, applyHoldAndTrim, primariesProgressing, extraSetSlots, applyExtraSets, extraSetsAllowed } from '../../web/engine/checkin.js';
import { cycleSummary, defaultProposal, applyLevelChanges, slotsWithSwaps, levelCeilings } from '../../web/engine/review.js';
import { validateProposal } from '../../web/engine/review_validate.js';
import { addDays, daysBetween, LOWER_PATTERNS, isSixtyPlus } from '../../web/engine/util.js';
import { lineChecks, sessionChecks, weekChecks, seriesChecks, reviewChecks, reviewWatch } from './checks.mjs';

export const RUN_START = '2026-01-05';                         // a Monday; dates in reports are relative to it
const DAYS = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4] };     // training days within a week (Mon = 0)
const START = { dumbbell: 10, kettlebell: 18, machine: 40, cable: 30, barbell: 45, band: 2 };

/** Sessions she does in global week g: the persona's script for that week, else `default`, else every planned day. */
export function weekScript(p, g) {
  const w = Array.isArray(p.weeks) ? p.weeks[g - 1] : p.weeks?.[String(g)];
  if (w) return w;
  if (p.default) return p.default;
  return Array.from({ length: p.days }, () => ({}));
}

/**
 * Run one persona for `weeks` calendar weeks.
 * @returns result with cycles (plan, review), weeks (sessions, adjustments, flags), levelUps, violations, watch.
 */
export function runPersona(p, content, { weeks = 30 } = {}) {
  const { library, templates, slots, setups, settings } = content;
  const equipFor = (setup) => {
    const s = setups.find((x) => x.setup === setup);
    if (!s) throw new Error(`${p.key}: setup "${setup}" is not in the content`);
    return s.equipment.filter((e) => e !== 'none');
  };
  const me = { setup: p.setup, dumbbells: p.dumbbells || [] };   // changes by events, used from the next cycle
  const levels0 = startingLevels({ experience: p.experience, check: p.check || {}, ageBand: p.age_band });
  const patient = {
    age_band: p.age_band, experience: p.experience, goal: 'keep_muscle', setup: p.setup, equipment: equipFor(p.setup),
    restrictions: p.restrictions || [], workarounds: p.workarounds || [], floor_ok: Boolean(p.floorOk),
    dumbbells_available: me.dumbbells, days_per_week: p.days, session_minutes: p.minutes, pattern_levels: levels0,
  };
  const profileOf = () => ({ equipment: patient.equipment, patternLevels: patient.pattern_levels, workarounds: patient.workarounds,
    restrictions: patient.restrictions, floorOk: patient.floor_ok });

  const out = { persona: p, cycles: [], weeks: [], levelUps: [], violations: [], watch: [], notes: [] };
  const cap = new Map(); const hist = {};
  const allLogs = []; const allExLogs = []; const flags = []; const clears = [];
  const lib = Object.fromEntries(library.map((e) => [e.id, e]));
  let logId = 0; let curG = 1; let weekRows = []; let cycle = null; let cycleLogs = []; let cycleExLogs = []; let adjustments = []; let prevSore = [];

  const startCycle = (type, start, { avoid = [], swaps = [], days = p.days, restartOf = null } = {}) => {
    const perWeek = type === 'C1' && days === 4 ? 3 : days;
    const template = restartOf?.template ?? chooseTemplate(templates, { cycleType: type, daysPerWeek: perWeek, experienced: type !== 'C1' });
    if (!template) throw new Error(`${p.key}: no template for ${type} at ${perWeek} days`);
    const own = slotsWithSwaps(slots.filter((s) => s.template_id === template.template_id), swaps);
    // A restart (§13, B7) keeps the same exercises; otherwise the plan is built fresh.
    const plan = restartOf ? { ...restartOf.plan, sessions: restartOf.plan.sessions.map((x) => ({ ...x, items: x.items.map((i) => ({ ...i })) })) }
      : materializeCycle(template, own, profileOf(), library, { minutes: p.minutes, used: avoid, ageBand: p.age_band, settings });
    cycle = { cycle_no: (cycle?.cycle_no ?? 0) + 1, capNo: restartOf ? restartOf.capNo : (cycle?.cycle_no ?? 0) + 1, restart: Boolean(restartOf), cycle_type: type, template_id: template.template_id, start_date: start,
      session_minutes: p.minutes, week_modes: {}, template, plan, levels: { ...patient.pattern_levels },
      equipment: [...patient.equipment], dumbbells: [...me.dumbbells] };
    out.cycles.push({ no: cycle.cycle_no, type, restart: cycle.restart, template: { id: template.template_id, name: template.name }, start, levels: cycle.levels,
      setup: patient.setup, skipped: plan.skipped,
      plan: plan.sessions.map((s) => ({ session: s.session, name: s.name, items: s.items.map((it) => ({
        slot: it.slot.slot, role: it.slot.role, pattern: it.slot.pattern, id: it.exercise?.id ?? null, name: it.exercise?.name ?? null,
        level: it.exercise?.level ?? null, note: swapNote(it.reasons || [], { includeEquipment: false }) })) })) });
    if (plan.skipped) out.watch.push({ rule: 'no_option', cycle: cycle.cycle_no, date: start, detail: `${plan.skipped} slot(s) skipped` });
    cycleLogs = []; cycleExLogs = []; adjustments = [];
  };

  const review = (date) => {
    const summary = cycleSummary({ patient, cycle: { ...cycle, template_id: cycle.template_id }, template: cycle.template,
      logs: cycleLogs, exerciseLogs: cycleExLogs, flags: flags.filter((f) => f.cycle_no === cycle.cycle_no), adjustments, library, reflection: { days: p.review?.days, focus: p.review?.focus } });
    const ceilings = levelCeilings(profileOf(), setups.find((x) => x.setup === patient.setup) ?? null, library.filter((e) => e.active));
    const proposal = defaultProposal(summary, { settings, ceilings });
    const validation = validateProposal(proposal, { summary, library, profile: profileOf(), settings });
    const rec = out.cycles[out.cycles.length - 1];
    rec.review = { date, adherence: summary.adherence.pct, completed: summary.adherence.completed, next: proposal.cycle_type,
      level_changes: proposal.level_changes, ceilings, swaps: proposal.swaps, recap: proposal.recap, validation };
    out.violations.push(...reviewChecks(validation, { cycle: cycle.cycle_no, date }, { proposal, levels: patient.pattern_levels, ceilings }));
    out.watch.push(...reviewWatch(validation, { cycle: cycle.cycle_no, date }));
    patient.pattern_levels = applyLevelChanges(patient.pattern_levels, proposal.level_changes);
    patient.setup = me.setup; patient.equipment = equipFor(me.setup); patient.dumbbells_available = [...me.dumbbells];
    const avoid = proposal.cycle_type === cycle.cycle_type ? cycle.plan.sessions.flatMap((s) => s.items.map((i) => i.exercise?.id)).filter(Boolean) : [];
    startCycle(proposal.cycle_type, date, { avoid, swaps: proposal.swaps, days: proposal.days_per_week });
  };

  startCycle(startingCycle({ experience: p.experience, check: p.check || {} }), RUN_START);

  for (let g = 1; g <= weeks; g++) {
    curG = g; weekRows = [];
    const weekStart = addDays(RUN_START, (g - 1) * 7);
    const ev = p.events?.[String(g)];
    if (ev) {
      if (ev.setup) { me.setup = ev.setup; me.dumbbells = ev.dumbbells ?? []; }   // a gym has the full rack
      else if (ev.dumbbells) me.dumbbells = ev.dumbbells;
      out.notes.push({ week: g, text: `Equipment change to ${me.setup}: used from her next cycle (the app has no mid-cycle equipment change).` });
    }
    const script = weekScript(p, g);
    let cw = weekOfCycle(cycle.start_date, weekStart);
    if (script.length && restartDue({ mode: comebackNow(weekStart).mode, rawWeek: cw,
      lastWeekInCycle: cycleLogs.length ? Math.max(...cycleLogs.map((l) => l.week)) : null })) {
      out.notes.push({ week: g, text: `Back after 28+ days in cycle week ${Math.min(cw, 9)}: cycle ${cycle.cycle_type} restarts at week 1 with the same exercises and levels.` });
      startCycle(cycle.cycle_type, weekStart, { restartOf: cycle });
      cw = 1;
    }
    if (cw > 9) {
      if (!script.length) { out.weeks.push({ g, waiting: true, cycle: cycle.cycle_no, sessions: [] }); continue; }
      review(weekStart);
      cw = 1;
    }
    const order = cycle.template.sessions.map((s) => s.session);
    const flagCount = cw === 4 || cw === 9 ? flags.filter((f) => f.date >= weekWindow(cycle.start_date, cw - 2).from).length : 0;
    const d = weekModeFor({ week: cw, cycle, logs: cycleLogs, daysPerWeek: cycle.template.days_per_week, flagCount, settings });
    if (!d.stored) cycle.week_modes[String(cw)] = { mode: d.mode, consistent: d.consistent, restReasons: d.restReasons };
    const wk = { g, cycle: cycle.cycle_no, cw, mode: d.mode, modeMsg: weekModeMessage(d.mode), restReasons: d.restReasons ?? [],
      planned: cycle.template.days_per_week, sessions: [] };
    script.slice(0, order.length).forEach((s, i) => {
      const date = addDays(weekStart, DAYS[cycle.template.days_per_week]?.[i] ?? i);
      wk.sessions.push(session({ ...s, letter: order[i] }, cw, d.mode, date));
    });
    wk.adjustments = adjustments.filter((a) => a.g === g).map(({ type, reason, detail }) => ({ type, reason, detail }));
    const wc = weekChecks(wk, settings, { ageBand: p.age_band });
    out.violations.push(...wc.violations);
    out.watch.push(...wc.watch);
    out.weeks.push(wk);
  }
  out.watch.push(...seriesChecks(out.weeks));
  out.final = { levels: patient.pattern_levels, cycle: cycle.cycle_no, type: cycle.cycle_type, workouts: allLogs.length };
  return out;

  // The comeback for a workout on `date` (§13, B7): the same call the home screen makes.
  function comebackNow(date) {
    const at = (l) => l && { date: l.log_date, cycleStart: l.cycleStart };
    return comebackFor([at(allLogs[allLogs.length - 1]), at(allLogs[allLogs.length - 2])].filter(Boolean), cycle, date, settings);
  }

  function session(s, cw, mode, date) {
    const last = allLogs.length ? { date: allLogs[allLogs.length - 1].log_date, cycleStart: allLogs[allLogs.length - 1].cycleStart } : null;
    if (s.better) clears.push({ type: 'workaround_cleared', detail: { area: s.better }, created_at: `${date}T06:00:00Z` });
    const standing = standingAreas(flags.filter((f) => f.type === 'pain'), clears);
    const comeback = comebackNow(date);
    const gapDays = last && last.cycleStart === cycle.start_date ? daysBetween(last.date, date) : null;
    const active = activeAdjustments({ adjustments, logs: cycleLogs, week: cw });
    const lighterByCheckin = active.lighterWeek && mode === 'build';
    const weekMode = lighterByCheckin ? 'lighter' : mode;
    const sessPlan = cycle.plan.sessions.find((x) => x.session === s.letter);
    let items = sessPlan.items.filter((it) => it.exercise);
    const areas = [...new Set([...(s.areas || []), ...(s.pain ? [s.pain] : []), ...standing])];
    const profile = profileOf();
    const swaps = [];
    if (areas.length) {
      const r = applyWorkarounds(items, areas, profile, library);
      items = r.items.filter((x) => x.exercise); swaps.push(...r.swaps);
    }
    let plan = planSession(items, { week: cw, weekMode, cycleType: cycle.cycle_type, cycleNo: cycle.capNo, ageBand: p.age_band, dumbbells: cycle.dumbbells,
      comeback, history: hist, settings });
    plan = applyHold(applySoreness(plan, prevSore).items);
    if (active.holdAndTrim) plan = applyHoldAndTrim(plan);
    const extra = active.extraSets && !active.holdAndTrim && extraSetsAllowed(weekMode);
    if (extra) {
      const bySession = Object.fromEntries(cycle.plan.sessions.map((x) => [x.session, x.items.filter((i) => i.exercise).map((i) => i.slot)]));
      plan = applyExtraSets(plan, extraSetSlots(bySession, { week: cw, cycleType: cycle.cycle_type, settings }), s.letter);
    }
    const scaled = Boolean(s.energy === 'low' && s.scale);
    if (scaled) plan = scaleToday(plan, settings);
    const lines = plan.map((it) => perform(it, s, cw, date));
    const log = { id: ++logId, cycle_id: cycle.cycle_no, cycleStart: cycle.start_date, log_date: date, week: cw, session: s.letter,
      status: 'done', feel: s.feel || 'right', energy: s.energy || 'ok', soreness: s.soreness || (s.sore?.length ? 'some' : 'none'),
      sore_areas: s.sore || [], workaround_areas: s.areas || [], scaled };
    allLogs.push(log); cycleLogs.push(log); prevSore = log.sore_areas;
    for (const l of lines) {
      const row = { session_log_id: log.id, exercise_id: l.id, sets: l.setsLogged, rating: l.rating, skipped: false, created_at: `${date}T12:00:00Z` };
      allExLogs.push(row); cycleExLogs.push(row);
    }
    if (s.pain) flags.push({ type: 'pain', detail: { session_log_id: log.id, area: s.pain }, date, created_at: `${date}T12:00:00Z`, cycle_no: cycle.cycle_no });
    weekRows.push(...lines.map((l) => ({ role: l.role, rating: l.rating, skipped: false })));
    const act = checkinActions({ logs: cycleLogs, flags: flags.filter((f) => f.cycle_no === cycle.cycle_no), adjustments, cycle,
      week: cw, perWeek: cycle.template.days_per_week, today: date, lastLogId: log.id, settings, primariesProgressing: primariesProgressing(weekRows) });
    adjustments.push(...act.adjustments.map((a) => ({ ...a, g: curG })));
    flags.push(...act.flags.map((f) => ({ ...f, date, created_at: `${date}T12:00:00Z`, cycle_no: cycle.cycle_no })));
    const offers = offer(plan, cw, date);
    const ctx = { cycle, profile, areas, ageBand: p.age_band, settings, cw };   // extra sets are allowed by line (extraSet flag)
    const checked = lines.map((l) => ({ ...l, checks: lineChecks(l, ctx) }));
    for (const l of checked) out.violations.push(...l.checks.map((c) => ({ ...c, cycle: cycle.cycle_no, date, slot: l.slot, exercise: l.id })));
    out.violations.push(...sessionChecks({ gapDays, comeback: comeback.mode, settings }).map((c) => ({ ...c, cycle: cycle.cycle_no, date })));
    return { letter: s.letter, date, cw, weekMode, comeback: comeback.mode, second: Boolean(comeback.second), standing, offers, scaled, holdAndTrim: active.holdAndTrim, lighterByCheckin, extraSets: extra, swaps,
      checkin: { feel: log.feel, energy: log.energy, soreness: log.soreness, sore: log.sore_areas, areas: log.workaround_areas, pain: s.pain || null },
      triggered: act.adjustments.map((a) => `${a.type} (${a.reason})`), flagsRaised: act.flags.map((f) => f.detail?.reason ?? f.type),
      messages: act.messages, lines: checked };
  }

  // In-cycle level-up offers on the reward screen (§5.3, B6): she accepts unless the persona says `"offer": "decline"`.
  // Accepting raises the level and swaps that pattern's exercises for the rest of the cycle.
  function offer(plan, cw, date) {
    const cycleItems = cycle.plan.sessions.flatMap((x) => x.items.map((i) => ({ session: x.session, slot: i.slot.slot, ord: i.slot.ord,
      pattern: i.slot.pattern, exercise_id: i.exercise?.id ?? null })));
    const cycleSlots = cycle.plan.sessions.flatMap((x) => x.items.map((i) => i.slot));
    const ceilings = levelCeilings(profileOf(), setups.find((x) => x.setup === patient.setup) ?? null, library.filter((e) => e.active));
    const offers = levelUpOffers(plan.filter((it) => !it.swappedFor).map((it) => ({ slot: it.slot, exercise: it.exercise, range: it.range, measure: it.measure })), hist,
      { week: cw, cycleItems, slots: cycleSlots, profile: profileOf(), library, ceilings, ageBand: p.age_band, adjustments, today: date, settings,
        dumbbells: cycle.dumbbells }).slice(0, 1);   // the reward screen shows one offer at a time
    const minWeek = Number(settings?.['levelup.offer_min_week'] ?? OFFER_DEFAULTS['levelup.offer_min_week']);
    const days = Number(settings?.['levelup.offer_decline_days'] ?? OFFER_DEFAULTS['levelup.offer_decline_days']);
    return offers.map((o) => {
      const at = { cycle: cycle.cycle_no, date };
      if (cw < minWeek) out.violations.push({ ...at, rule: 'offer_early', detail: `${o.pattern} offered in week ${cw}` });
      const declined = adjustments.filter((a) => a.type === 'level_offer_declined' && a.detail.pattern === o.pattern).map((a) => a.created_at.slice(0, 10)).sort().pop();
      if (declined && daysBetween(declined, date) < days) out.violations.push({ ...at, rule: 'offer_repeat', detail: `${o.pattern} again ${daysBetween(declined, date)} days after "Not yet"` });
      const accept = p.offer !== 'decline';
      const detail = { pattern: o.pattern, from: o.from, to: o.to, exercise: o.exercise.id, next: o.next.id };
      adjustments.push({ type: accept ? 'level_offer_accepted' : 'level_offer_declined', reason: 'in_cycle_offer', detail, g: curG, created_at: `${date}T12:30:00Z` });
      if (accept) {
        patient.pattern_levels = { ...patient.pattern_levels, [o.pattern]: o.to };
        cycle.levels = { ...cycle.levels, [o.pattern]: o.to };
        for (const pk of o.picks) {
          const it = cycle.plan.sessions.find((x) => x.session === pk.session)?.items.find((i) => i.slot.slot === pk.slot);
          if (it) Object.assign(it, { exercise: lib[pk.exercise_id], reasons: pk.reasons });
        }
      }
      const rec = { cycle: cycle.cycle_no, week: cw, g: curG, date, pattern: o.pattern, from: o.from, to: o.to, name: o.exercise.name, next: o.next.name,
        outcome: accept ? 'accepted' : 'declined', swaps: o.picks.length };
      out.levelUps.push(rec);
      return rec;
    });
  }

  // Her simulated performance: a capacity per exercise that grows a little each session; reps and rating follow
  // how the suggested weight compares with it. Hard days ("too hard" check-in) hit the bottom of the range.
  function perform(it, s, cw, date) {
    const ex = it.exercise;
    const opts = { lower: LOWER_PATTERNS.has(ex.pattern), ageBand: p.age_band,
      available: ex.load_type === 'dumbbell' && cycle.dumbbells.length ? cycle.dumbbells : undefined };
    const range = it.range; const sets = it.dose.sets; const hardDay = s.feel === 'too_hard'; const easyDay = s.feel === 'too_easy';
    let w = it.weight; let found = false;
    if (ex.load_type !== 'bodyweight' && ex.measure !== 'time') {
      if (!cap.has(ex.id)) cap.set(ex.id, Math.max(1, START[ex.load_type] * (p.strength ?? 1) * (opts.lower ? 1.5 : 1)));
      if (w == null) {
        const c = cap.get(ex.id);
        const guess = roundDownToStep(ex.load_type, c * 0.85, opts);
        w = findYourWeight({ loadType: ex.load_type, weight: guess, rating: guess / c <= 0.88 ? 'easy' : 'good', ...opts }).weight;
        found = true;
      }
    }
    let reps; let rating;
    if (ex.measure === 'time') { reps = range.hi; rating = easyDay ? 'easy' : 'good'; }
    else if (ex.load_type === 'bodyweight') { reps = hardDay ? range.lo : range.hi; rating = hardDay ? 'hard' : easyDay ? 'easy' : 'good'; }
    else {
      const r = w / cap.get(ex.id);
      reps = hardDay ? range.lo : r <= 0.85 ? range.hi + 3 : r <= 1 ? range.hi : r <= 1.08 ? Math.round((range.lo + range.hi) / 2) : range.lo - 1;
      rating = hardDay ? 'hard' : r <= 0.85 || easyDay ? 'easy' : r <= 1.08 ? 'good' : 'hard';
      cap.set(ex.id, cap.get(ex.id) * (isSixtyPlus(p.age_band) ? 1.01 : 1.02));
    }
    const stage = it.suggestion.stage || undefined;
    const setsLogged = Array.from({ length: sets }, () => (ex.measure === 'time' ? { weight: w, seconds: reps } : { weight: w, reps, stage }));
    hist[ex.id] = [{ skipped: false, rating, sets: setsLogged, created_at: `${date}T12:00:00Z` }, ...(hist[ex.id] || [])];
    const label = w == null ? (ex.measure === 'time' ? '' : 'bodyweight') : ex.load_type === 'band' ? `${BAND_LABELS[w]} band` : `${w} lb`;
    return { slot: it.slot.slot, role: it.slot.role, pattern: it.slot.pattern, id: ex.id, name: ex.name, level: ex.level, load_type: ex.load_type,
      measure: ex.measure, exercise: ex, sets, written: it.slot, range: `${range.lo}-${range.hi}`, rir: it.dose.rir, weight: w, lastWeight: it.lastWeight ?? null,
      extraSet: Boolean(it.extraSet), weightLabel: label + (it.suggestion.tempo ? ` (${it.suggestion.tempo.replace(/ on every rep| at the hardest point/g, '').replace(/\.$/, '').toLowerCase()})` : ''), found, stage: stage ?? 0, reps, rating, setsLogged, action: it.suggestion.action, note: it.suggestion.note,
      swappedFor: it.swappedFor || null, soreArea: it.soreArea || null };
  }
}

/** Run every persona; returns { results, ms }. */
export function runAll(personas, content, { weeks = 30, now = () => 0 } = {}) {
  const t0 = now();
  const results = personas.map((p) => runPersona(p, content, { weeks }));
  return { results, ms: now() - t0 };
}
