// Simulate 9-week cycles for the test personas against real content and print a Markdown review report.
//   node scripts/simulate.mjs <content.json from export_content_json.py> > report.md
// Deterministic (no randomness): each persona has a scripted attendance and check-in pattern.
// The report is built from private content: save it outside this repo.

import { readFileSync } from 'node:fs';
import { startingLevels, startingCycle, shouldOfferLevelUp } from '../web/engine/levels.js';
import { chooseTemplate, materializeCycle, adaptiveWeekMode, slotDose, weekModeMessage } from '../web/engine/cycle.js';
import { suggestNext, findYourWeight, reduceLoad, BAND_LABELS } from '../web/engine/load.js';
import { swapNote } from '../web/engine/resolve.js';
import { comebackMode } from '../web/engine/adherence.js';
import { LOWER_PATTERNS } from '../web/engine/util.js';

const content = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { library, templates, slots, setups, settings } = content;
const setupEquip = (name) => setups.find((s) => s.setup === name).equipment;

// done: sessions completed per week (weeks 1–9); hard / low: "too hard" and low-energy check-ins per week.
const PERSONAS = [
  { key: 'P1', name: 'Dana', age: 46, band: '40-49', setup: 'commercial_gym', days: 3, minutes: 45, experience: 'none',
    check: {}, workarounds: ['knees'], restrictions: [], floorOk: false, strength: 1.0,
    done: [3, 3, 3, 3, 3, 2, 3, 3, 3], hard: [0, 1, 1, 0, 0, 0, 1, 1, 0], low: [0, 0, 0, 0, 0, 0, 0, 1, 0],
    story: 'True beginner, achy knees on stairs, big-box gym, very consistent.' },
  { key: 'P2', name: 'Maria', age: 52, band: '50-59', setup: 'minimal_home', days: 2, minutes: 30, experience: 'some',
    check: { sitToStand: true }, workarounds: ['low_back'], restrictions: [], floorOk: false, strength: 0.9,
    available: [5, 8, 10, 12, 15], done: [2, 1, 2, 2, 1, 2, 1, 2, 2], hard: [0, 0, 0, 0, 0, 0, 0, 0, 0], low: [0, 1, 0, 0, 1, 0, 0, 0, 0],
    story: 'Bands + dumbbells 5–15 lb at home, stiff low back, busy schedule (2 days, 30 min).' },
  { key: 'P3', name: 'Jen', age: 41, band: '40-49', setup: 'barbell_gym', days: 4, minutes: 60, experience: 'regular',
    check: { sitToStand: true, inclinePushup: true, hinge: true }, workarounds: [], restrictions: [], floorOk: true, strength: 1.4,
    done: [4, 4, 4, 4, 4, 4, 3, 4, 4], hard: [0, 0, 1, 1, 0, 0, 0, 0, 0], low: [0, 0, 1, 1, 0, 0, 0, 0, 0],
    story: 'Lifted before, CrossFit-style barbell gym, 4 days. Gets run down around week 3.' },
  { key: 'P4', name: 'Carol', age: 63, band: '60-69', setup: 'home_gym', days: 3, minutes: 45, experience: 'none',
    check: { sitToStand: true }, workarounds: [], restrictions: ['floor', 'supine'], floorOk: false, strength: 0.75,
    done: [3, 3, 2, 3, 3, 3, 3, 2, 3], hard: [0, 0, 0, 0, 0, 0, 0, 0, 0], low: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    story: '63, home dumbbells + bench, provider said avoid getting down to the floor and lying flat.' },
  { key: 'P5', name: 'Lisa', age: 48, band: '40-49', setup: 'commercial_gym', days: 3, minutes: 45, experience: 'some',
    check: {}, workarounds: [], restrictions: [], floorOk: false, strength: 1.0,
    done: [3, 2, 3, 2, 0, 3, 3, 2, 2], hard: [0, 0, 0, 0, 0, 0, 0, 0, 0], low: [0, 0, 0, 1, 0, 0, 0, 0, 0],
    story: 'Busy; misses all of week 5 (travel), comes back in week 6.' },
  { key: 'P6', name: 'Kim', age: 44, band: '40-49', setup: 'commercial_gym', days: 3, minutes: 30, experience: 'none',
    check: {}, workarounds: [], restrictions: [], floorOk: false, strength: 1.0, pausedWeeks: 1,
    done: [0, 3, 3, 3, 3, 3, 3, 3, 3], hard: [0, 0, 0, 0, 0, 0, 0, 0, 0], low: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    story: 'Red-flag answer at screening: paused until she self-attests provider clearance (1 week later).' },
  { key: 'P7', name: 'Mike', age: 49, band: '40-49', setup: 'commercial_gym', days: 3, minutes: 45, experience: 'some',
    check: { inclinePushup: true }, workarounds: ['shoulders'], restrictions: ['overhead'], floorOk: true, strength: 1.5,
    done: [3, 3, 3, 3, 3, 3, 3, 3, 3], hard: [0, 0, 0, 0, 0, 0, 0, 0, 0], low: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    story: 'Male patient; provider said no overhead pressing; touchy shoulder.' },
];

const START_WEIGHT = { dumbbell: 10, kettlebell: 18, machine: 40, cable: 30, barbell: 45, band: 2 };

function simulate(p) {
  const profile = { equipment: setupEquip(p.setup), workarounds: p.workarounds, restrictions: p.restrictions, floorOk: p.floorOk,
    patternLevels: startingLevels({ experience: p.experience, check: p.check, ageBand: p.band }) };
  const cycleType = startingCycle({ experience: p.experience, check: p.check });
  const template = chooseTemplate(templates, { cycleType, daysPerWeek: p.days, experienced: cycleType !== 'C1' });
  const plan = materializeCycle(template, slots, profile, library, { minutes: p.minutes });
  const loads = new Map();       // exercise id → { weight, capacity, last, prevRating, history: [weight by week] }
  const weeks = [];
  let lastDoneWeek = null;
  let plannedSince = 0, doneSince = 0;
  for (let week = 1; week <= 9; week++) {
    const planned = p.days;
    const done = p.done[week - 1];
    let mode = 'build';
    if (week === 4 || week === 9) {
      const signals = { tooHard: p.hard[week - 2] + p.hard[week - 3], lowEnergy: p.low[week - 2] + p.low[week - 3] };
      mode = adaptiveWeekMode({ week, planned: plannedSince, completed: doneSince, signals, settings }).mode;
      plannedSince = 0; doneSince = 0;
    }
    if (p.pausedWeeks && week <= p.pausedWeeks) { weeks.push({ week, mode: 'paused', done: 0, planned, notes: ['Program paused: waiting on her clearance self-attestation'] }); continue; }
    plannedSince += planned; doneSince += done;
    const notes = [];
    const levelUps = [];
    let comeback = { mode: 'none', loadCutPct: 0, setDelta: 0 };
    if (done > 0 && lastDoneWeek != null && week - lastDoneWeek >= 2) {
      comeback = comebackMode('2026-01-01', `2026-01-${String(1 + (week - lastDoneWeek) * 7 - 3).padStart(2, '0')}`, settings);
      notes.push(`Comeback: ${comeback.mode.replace('_', ' ')} (sets ${comeback.setDelta}, loads −${comeback.loadCutPct}%)`);
    }
    if (mode !== 'build') notes.push(`${mode}: ${weekModeMessage(mode)}`);
    for (let s = 0; s < done; s++) {
      const sess = plan.sessions[s % plan.sessions.length];
      for (const it of sess.items) {
        if (!it.exercise || it.slot.role === 'F' || it.slot.role === 'O') continue;
        const ex = it.exercise;
        const dose = slotDose(it.slot, week, mode, settings);
        const lower = LOWER_PATTERNS.has(ex.pattern);
        let st = loads.get(ex.id);
        if (!st) {
          if (ex.load_type === 'bodyweight') { st = { weight: null, capacity: 1, last: null, prevRating: null, history: {} }; }
          else {
            const guess = Math.round(START_WEIGHT[ex.load_type] * p.strength * (lower ? 1.5 : 1) * 2) / 2;
            const fy = findYourWeight({ loadType: ex.load_type, weight: guess, rating: 'easy', lower, ageBand: p.band, available: p.available });
            st = { weight: fy.weight, capacity: fy.weight * 1.12, last: null, prevRating: null, history: {} };
          }
          loads.set(ex.id, st);
        } else if (st.last) {
          const sug = suggestNext({ loadType: ex.load_type, last: st.last, prevRating: st.prevRating, range: dose.reps, ageBand: p.band,
            lower, weekMode: mode, earlyFoundations: cycleType === 'C1' && week <= 3, settings, available: p.available });
          if (sug.weight != null) st.weight = sug.weight;
          const atCeiling = sug.action === 'level-up-check' || sug.action === 'progress-bodyweight';
          st.recent = [...(st.recent ?? []), { allTop: st.last.sets.every((x) => x.reps >= dose.reps.hi), rating: st.last.rating }];
          if (!st.offered && shouldOfferLevelUp({ level: ex.level, recent: st.recent, atCeiling, cycleType, week })) {
            st.offered = true;
            levelUps.push(`${ex.name}: next level offered (${ex.load_type === 'bodyweight' ? 'bodyweight' : 'top of her equipment'})`);
          }
        }
        let weight = st.weight;
        if (comeback.loadCutPct) weight = reduceLoad(ex.load_type, weight, comeback.loadCutPct, { available: p.available });
        // her performance: how far under her capacity the weight is
        const ratio = weight == null ? 0.8 : weight / st.capacity;
        const hardDay = p.hard[week - 1] > 0 && s === 0;
        const reps = hardDay ? dose.reps.lo : ratio <= 0.85 ? dose.reps.hi + 3 : ratio <= 1 ? dose.reps.hi : ratio <= 1.08 ? Math.round((dose.reps.lo + dose.reps.hi) / 2) : dose.reps.lo - 1;
        const rating = hardDay ? 'hard' : ratio <= 0.85 ? 'easy' : ratio <= 1.08 ? 'good' : 'hard';
        const sets = Math.max(1, dose.sets + comeback.setDelta);
        st.prevRating = st.last?.rating ?? null;
        st.last = { weight, sets: Array.from({ length: sets }, () => ({ reps })), rating };
        st.capacity *= p.band === '60-69' || p.band === '70+' ? 1.01 : 1.02;   // beginner gains per exposure
        st.history[week] = weight;
      }
    }
    if (done > 0) lastDoneWeek = week;
    notes.push(...levelUps);
    weeks.push({ week, mode, done, planned, notes });
  }
  return { profile, cycleType, template, plan, weeks, loads };
}

const fmtW = (w, ex) => (w == null ? 'BW' : ex?.load_type === 'band' ? BAND_LABELS[w] : `${w} lb`);
const out = [];
out.push('# Persona simulation: 9-week cycle per test persona', '');
out.push(`Content: ${library.length} exercises, ${templates.length} templates. Engine: web/engine (deterministic rules only, no AI).`, '');
out.push('Each persona has a scripted attendance and check-in pattern; her performance follows a simple beginner-gains model. The point is to check what the **engine** decides: exercise choices and swaps, week-4/9 modes, comebacks and load progression.', '');
for (const p of PERSONAS) {
  const r = simulate(p);
  out.push(`## ${p.key} · ${p.name}, ${p.age}`, '', `*${p.story}*`, '');
  out.push(`- Setup **${p.setup}** · ${p.days} days · ${p.minutes} min · work-arounds: ${p.workarounds.join(', ') || 'none'} · restrictions: ${p.restrictions.join(', ') || 'none'}`);
  out.push(`- Starting levels: ${Object.entries(r.profile.patternLevels).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  out.push(`- Template **${r.template.template_id}** (${r.template.name})${r.plan.skipped ? ` · ⚠ ${r.plan.skipped} slot(s) had no option` : ''}`, '');
  for (const s of r.plan.sessions) {
    out.push(`**${s.name}**`, '', '| Slot | Pattern | Exercise | Lvl | Note |', '|---|---|---|---|---|');
    for (const it of s.items) {
      out.push(`| ${it.slot.slot} (${it.slot.role}) | ${it.slot.pattern} | ${it.exercise ? it.exercise.name : '— skipped —'} | ${it.exercise?.level ?? ''} | ${swapNote(it.reasons) || it.slot.note || ''} |`);
    }
    out.push('');
  }
  const prim = r.plan.sessions[0].items.filter((it) => it.slot.role === 'P' && it.exercise && it.exercise.load_type !== 'bodyweight').slice(0, 2);
  out.push(`| Week | Mode | Done | ${prim.map((it) => it.exercise.name).join(' | ')} | Notes |`, `|---|---|---|${prim.map(() => '---|').join('')}---|`);
  for (const w of r.weeks) {
    const cells = prim.map((it) => { const h = r.loads.get(it.exercise.id)?.history; return h && w.week in h ? fmtW(h[w.week], it.exercise) : '·'; });
    out.push(`| ${w.week} | ${w.mode} | ${w.done}/${w.planned} | ${cells.join(' | ')} | ${w.notes.join('; ')} |`);
  }
  out.push('');
}
console.log(out.join('\n'));
