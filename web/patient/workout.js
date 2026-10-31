// The workout: warm-up, then one exercise at a time with suggested weights, set logging, rest timer, swaps,
// "Something hurts", and the always-visible "I feel dizzy or unwell" button (Framework §3 S4, §6, §8, §9, §10).
import { h, clear } from '../shared/dom.js';
import { choices, primary, secondary } from '../shared/ui.js';
import { swapNote } from '../engine/resolve.js';
import { findYourWeight } from '../engine/load.js';
import { swapOptions, weightLabel, lastTimeText } from '../engine/session.js';
import { formatRange, LOWER_PATTERNS } from '../engine/util.js';
import { saveExercise, finishSession, discardSession, raiseFlag } from './log_api.js';
import { stepper, weightControl, restTimer, holdTimer, openSheet, dizzySheet } from './workout_parts.js';
import { WARNING_SIGNS, HURTS, RATING_OPTIONS, EFFORT_CUE, BREATH_CUE, FAST_CUE, AREA_OPTIONS, areaName } from './session_copy.js';

const FIND_OPTIONS = [{ value: 'much', label: 'Way too light' }, ...RATING_OPTIONS];

/**
 * w: { patient, cycle, sessionLog, sessionName, items, warmup, existing (exercise_logs of this session), planner, onFinish }
 */
export function runWorkout(root, w) {
  const uid = w.patient.id;
  const lib = Object.fromEntries(w.planner.lib.map((e) => [e.id, e]));
  const states = w.items.map((item) => ({ item, sets: [], rating: null, skipped: !item.exercise, swappedFrom: null, swapReason: null }));
  for (const log of w.existing || []) {
    const st = states.find((s) => s.item.slot.slot === log.slot);
    if (!st) continue;
    if (log.exercise_id !== st.item.exercise?.id && lib[log.exercise_id]) st.item = { ...st.item, exercise: lib[log.exercise_id], weight: null };
    Object.assign(st, { sets: log.sets || [], rating: log.rating, skipped: log.skipped, swappedFrom: log.swapped_from, swapReason: log.swap_reason });
  }
  const finished = (st) => st.skipped || st.rating != null;
  let i = w.existing?.length ? Math.max(0, states.findIndex((s) => !finished(s))) : -1;
  if (w.existing?.length && states.every(finished)) i = states.length;
  let dizzy = false;

  const save = (st) => saveExercise(uid, w.sessionLog.id, {
    slot: st.item.slot.slot, exerciseId: st.item.exercise.id, swappedFrom: st.swappedFrom, swapReason: st.swapReason,
    sets: st.sets, rating: st.rating, skipped: st.skipped,
  }).catch((e) => { console.error(e); toast('Not saved yet. Check your connection.'); });

  const toast = (text) => { const t = root.querySelector('.toast'); if (t) t.textContent = text; };

  const header = () => h('div', { class: 'workout-bar' },
    h('div', {}, h('div', { class: 'small muted' }, w.sessionName),
      h('div', { class: 'progress' }, h('span', { style: `width:${Math.round((Math.max(0, i) / states.length) * 100)}%` }))),
    h('button', { type: 'button', class: 'btn btn-warn', onclick: () => dizzySheet({
      raise: () => raiseFlag(uid, 'dizzy', { session_log_id: w.sessionLog.id, slot: states[i]?.item.slot.slot ?? null }),
      onKeepGoing: () => {}, onEnd: () => { dizzy = true; end(); },
    }) }, 'I feel dizzy or unwell'));

  const footer = () => h('p', { class: 'small muted warning-signs' }, WARNING_SIGNS);

  const go = (n) => { i = n; render(); window.scrollTo?.(0, 0); };
  const next = () => {
    const k = states.findIndex((s, j) => j > i && !finished(s));
    go(k === -1 ? states.length : k);
  };

  function render() {
    clear(root);
    if (i < 0) return root.append(header(), warmupScreen(), footer());
    if (i >= states.length) return root.append(header(), doneScreen(), footer());
    root.append(header(), exerciseScreen(states[i]), footer(), h('p', { class: 'toast small', role: 'status' }));
  }

  function warmupScreen() {
    const wu = w.warmup;
    return h('section', { class: 'step' },
      h('h1', {}, 'Warm-up'),
      h('p', { class: 'lead' }, 'About 5 minutes of easy movement. Follow along at your own pace.'),
      wu ? h('ol', { class: 'card exlist warmup' }, wu.moves.map((m) => h('li', {},
        h('span', { class: 'exname' }, m.move), ' · ', h('span', {}, m.dose), m.cue ? h('span', { class: 'note' }, m.cue) : null))) : null,
      h('div', { class: 'actions' }, primary('Warm-up done', () => go(Math.max(0, states.findIndex((s) => !finished(s)))))));
  }

  function exerciseScreen(st) {
    const { item } = st;
    const ex = item.exercise;
    const time = item.measure === 'time';
    const loaded = ex.load_type !== 'bodyweight';
    const finding = item.suggestion.action === 'find' && loaded && ex.load_type !== 'band';
    const note = item.swappedFor ? `Giving your ${areaName(item.swappedFor)} a break. Here’s your swap.` : swapNote(item.reasons || []);
    const target = `${item.dose.sets} ${item.dose.sets === 1 ? 'set' : 'sets'} × ${formatRange(item.range)} ${time ? 'seconds' : ex.measure === 'steps' ? 'steps' : 'reps'}`;
    const suggested = weightLabel(ex.load_type, item.weight);
    const cues = [...(ex.cues || []), BREATH_CUE, EFFORT_CUE(item.dose.rir)];
    if (w.cycle.cycle_type !== 'C1' && (item.slot.pattern === 'SQ' || item.slot.pattern === 'SL')) cues.push(FAST_CUE);

    const dumbbells = ex.load_type === 'dumbbell' ? (w.patient.dumbbells_available || []).map(Number) : [];
    const setsBox = h('div', { class: 'sets' });
    const after = h('div', {});
    let weight = st.sets.length ? st.sets[st.sets.length - 1].weight ?? item.weight : item.weight;

    // Done sets, then any message or rest timer (extra), then the current set, then the sets still to come.
    const paintSets = (extra = []) => {
      clear(setsBox); clear(after);
      st.sets.forEach((s, k) => setsBox.append(h('div', { class: 'set done' }, h('span', { class: 'set-n' }, `Set ${k + 1}`),
        h('span', {}, [weightLabel(ex.load_type, s.weight), time ? `${s.seconds} s` : `${s.reps} reps`].filter(Boolean).join(' × ')), h('span', { 'aria-hidden': 'true' }, '✓'))));
      setsBox.append(...extra);
      if (st.skipped) { after.append(h('p', { class: 'muted' }, 'Skipped today.')); return; }
      if (st.sets.length < item.dose.sets) setsBox.append(currentSet(st.sets.length));
      else if (st.rating == null) after.append(rateExercise());
      for (let k = st.sets.length + 1; k < item.dose.sets; k++) setsBox.append(h('div', { class: 'set later' }, h('span', { class: 'set-n' }, `Set ${k + 1}`)));
    };

    function currentSet(k) {
      const wc = weightControl(ex.load_type, weight, { dumbbells, ageBand: w.patient.age_band, lower: LOWER_PATTERNS.has(item.slot.pattern) });
      const start = time ? item.range.lo : finding && k === 0 ? Math.min(item.range.hi, Math.max(item.range.lo, 10)) : item.suggestion.targetReps;
      const reps = stepper({ value: st.sets[k - 1]?.[time ? 'seconds' : 'reps'] ?? start, min: 0, max: time ? 600 : 50, by: time ? 5 : 1, label: time ? 'seconds' : 'reps', format: (n) => (time ? `${n} s` : `${n}`) });
      const msg = h('p', { class: 'form-msg', role: 'status' });
      return h('div', { class: 'set current card' },
        h('p', { class: 'set-n' }, `Set ${k + 1} of ${item.dose.sets}`),
        finding && k === 0 ? h('p', { class: 'small' }, 'First, a very light warm-up set of 8 (no need to log it). Then pick a weight you could lift about 12–15 times and do 10.') : null,
        wc ? h('div', { class: 'field' }, h('span', { class: 'small muted' }, ex.load_type === 'band' ? 'Band' : 'Weight'), wc.el) : null,
        h('div', { class: 'field' }, h('span', { class: 'small muted' }, time ? 'Seconds' : 'Reps'), reps.el),
        time ? holdTimer((s) => reps.set(s)) : null,
        msg,
        primary('Done set', () => {
          const wt = wc ? wc.get() : null;
          if (wc && (wt == null || Number.isNaN(wt) || wt <= 0)) { msg.textContent = 'Enter the weight you used.'; return; }
          const row = time ? { seconds: reps.get() } : { reps: reps.get() };
          if (wc) row.weight = wt;
          weight = wt;
          st.sets.push(row);
          save(st);
          if (finding && k === 0 && item.dose.sets > 1) return askFindYourWeight(wt);
          afterSet();
        }, { class: 'btn btn-primary wide' }));
    }

    function askFindYourWeight(wt) {
      setsBox.querySelector('.set.current')?.remove();
      setsBox.append(h('div', { class: 'card soft' }, h('h2', {}, 'How was that weight?'),
        choices({ columns: 2, options: FIND_OPTIONS, value: null, label: 'How was that weight?', onChange: (v) => {
          const r = findYourWeight({ loadType: ex.load_type, weight: wt, rating: v === 'much' ? 'easy' : v, muchEasier: v === 'much',
            lower: LOWER_PATTERNS.has(item.slot.pattern), ageBand: w.patient.age_band, available: dumbbells.length ? dumbbells : undefined });
          weight = r.weight;
          afterSet([h('p', { class: 'note-strong' }, `${r.note} ${weightLabel(ex.load_type, r.weight)}`.trim())]);
        } })));
    }

    function afterSet(extra = []) {
      const more = st.sets.length < item.dose.sets;
      const rest = more && item.dose.restSec ? [restTimer(item.dose.restSec, () => {})] : [];
      paintSets([...extra, ...rest]);
    }

    function rateExercise() {
      return h('div', { class: 'card soft' }, h('h2', {}, 'How did that feel?'),
        choices({ columns: 3, options: RATING_OPTIONS, value: null, label: 'How did that feel?', onChange: (v) => {
          st.rating = v; save(st); next();
        } }));
    }

    paintSets();
    return h('section', { class: 'step exercise' },
      h('p', { class: 'eyebrow' }, `Exercise ${i + 1} of ${states.length}`, w.today.scale ? ' · Scaled today' : ''),
      h('h1', {}, ex.name),
      note ? h('p', { class: 'note' }, note) : null,
      h('p', { class: 'target' }, target, suggested ? ` · ${suggested}` : ''),
      h('p', { class: 'muted small' }, item.suggestion.note),
      item.last ? h('p', { class: 'small muted' }, lastTimeText(ex.load_type, item.last, item.measure)) : null,
      h('details', { class: 'cues' }, h('summary', {}, 'How to do it'), h('ul', {}, cues.map((c) => h('li', {}, c)))),
      setsBox, after,
      h('div', { class: 'row tools' },
        st.sets.length ? null : secondary('Swap', () => swapSheet(st)),
        secondary('Something hurts', () => hurtsSheet(st)),
        st.sets.length || st.skipped ? null : secondary('Skip', () => { st.skipped = true; st.swapReason = 'skipped'; save(st); next(); })),
      h('div', { class: 'actions static' },
        secondary('End workout', () => confirmEnd()),
        finished(st) ? primary(i === states.length - 1 ? 'Finish' : 'Next', next) : null));
  }

  function swapSheet(st) {
    const opts = swapOptions(st.item.slot, w.planner.profile, w.planner.lib, st.item.exercise.id, { todayWorkarounds: w.today.areas });
    let close = () => {};
    const pick = async (ex) => {
      close();
      const fresh = await w.planner.replan(st.item, ex);
      st.swappedFrom = st.swappedFrom ?? st.item.exercise.id;
      st.swapReason = 'choice';
      st.item = { ...fresh, slot: st.item.slot };
      st.sets = []; st.rating = null;
      render();
    };
    close = openSheet('Swap this exercise', opts.length
      ? [h('p', { class: 'muted' }, 'Same movement, a different way to do it.'), h('div', { class: 'stack' }, opts.map((e) => secondary(e.name, () => pick(e))))]
      : [h('p', {}, 'There isn’t another option for this one with your equipment. You can skip it today.'), primary('OK', () => close())]);
  }

  function hurtsSheet(st) {
    let area = null; let kind = null;
    const msg = h('p', { class: 'form-msg', role: 'status' });
    let close = () => {};
    close = openSheet(HURTS.title, [
      h('p', {}, HURTS.lead),
      choices({ options: HURTS.options, value: null, label: 'What kind?', onChange: (v) => { kind = v; } }),
      h('p', { class: 'small muted' }, 'Where?'),
      choices({ columns: 2, options: AREA_OPTIONS, value: null, label: 'Where?', onChange: (v) => { area = v; } }),
      msg,
      primary('Continue', async () => {
        if (!kind || !area) { msg.textContent = 'Tap what it feels like and where.'; return; }
        if (kind === 'sore') { msg.textContent = HURTS.sore; return; }
        close();
        const keepCurrent = kind === 'pain' || st.sets.length > 0;
        if (keepCurrent && st.sets.length) { st.rating = st.rating ?? 'hard'; save(st); }
        if (kind === 'pain') {
          raiseFlag(uid, 'pain', { area, exercise_id: st.item.exercise.id, slot: st.item.slot.slot, session_log_id: w.sessionLog.id }).catch(console.error);
          if (!st.sets.length) { st.skipped = true; st.swapReason = 'pain'; save(st); }
        }
        const rest = states.map((s, j) => (j > i || (j === i && !keepCurrent) ? s : null));
        const live = rest.filter((s) => s && !finished(s) && s.item.exercise);
        const updated = await w.planner.workaround(live.map((s) => s.item), area);
        live.forEach((s, k) => {
          const u = updated[k];
          if (!u.exercise) { s.skipped = true; s.swapReason = `workaround:${area}`; if (s.item.exercise) save(s); return; }
          if (u.exercise.id !== s.item.exercise.id) {
            s.swappedFrom = s.swappedFrom ?? s.item.exercise.id; s.swapReason = `workaround:${area}`;
            s.item = { ...u, slot: s.item.slot }; s.sets = []; s.rating = null;
          }
        });
        if (keepCurrent) { next(); if (kind === 'pain') toast(HURTS.pain); } else render();
      }),
    ]);
  }

  function confirmEnd() {
    let close = () => {};
    close = openSheet('End today’s workout?', [
      h('p', {}, 'Everything you’ve done so far is saved and counts.'),
      h('div', { class: 'stack' }, primary('End workout', () => { close(); end(); }), secondary('Keep going', () => close())),
    ]);
  }

  async function end() {
    const logged = states.some((s) => s.sets.length);
    try {
      if (!logged && !dizzy) { await discardSession(w.sessionLog.id); return w.onFinish({ ended: true }); }
      if (!logged) { await finishSession(w.sessionLog.id, 'skipped', { skip_reason: 'not_feeling_well' }); return w.onFinish({ ended: true }); }
      await finishSession(w.sessionLog.id, 'partial');
      w.onFinish({ status: 'partial', states });
    } catch (e) { console.error(e); toast('Couldn’t save. Check your connection and try again.'); }
  }

  function doneScreen() {
    const sets = states.reduce((n, s) => n + s.sets.length, 0);
    const exercises = states.filter((s) => s.sets.length).length;
    const allDone = states.every((s) => s.skipped || s.sets.length >= s.item.dose.sets);
    const msg = h('p', { class: 'form-msg', role: 'status' });
    return h('section', { class: 'step center' },
      h('h1', {}, 'Last one done!'),
      h('p', { class: 'lead' }, `${exercises} exercises · ${sets} sets.`),
      msg,
      h('div', { class: 'actions' }, primary('Finish workout', async () => {
        msg.textContent = 'Saving…';
        try { await finishSession(w.sessionLog.id, allDone ? 'done' : 'partial'); w.onFinish({ status: allDone ? 'done' : 'partial', states }); }
        catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection and try again.'; }
      })));
  }

  render();
}
