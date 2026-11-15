// Benchmarks screens (B13): the home card, the test screen (every test can be skipped; nothing blocks a workout) and the
// first-vs-latest section for the progress screen. Switched off until `benchmarks.enabled` is set; wording is placeholder
// (benchmark_copy.js). Writes go through the outbox (log_writes.js), so they work without a signal.
import { h, clear } from '../shared/dom.js';
import { primary, secondary, choices, statusLine } from '../shared/ui.js';
import { screenChange } from '../shared/a11y.js';
import { CONFIG } from '../config.js';
import { TESTS, benchmarksEnabled, benchmarkMoment, parseValue, benchmarkProgress } from '../engine/benchmarks.js';
import { allBenchmarks, saveBenchmark } from './log_api.js';
import { BENCHMARK_COPY as C } from './benchmark_copy.js';

// "Not now" is remembered on this phone for this moment of this cycle (it asks again at the next transition week).
const storageKey = (k) => `${CONFIG.STORAGE_PREFIX}-${k}`;
const storageKeyBench = (uid, cycleId, moment) => storageKey(`bench-dismiss:${uid}:${moment === 'baseline' ? 'all' : cycleId}:${moment}`);
const dismissed = (uid, cycleId, moment) => { try { return localStorage.getItem(storageKeyBench(uid, cycleId, moment)) === '1'; } catch { return false; } };
const dismiss = (uid, cycleId, moment) => { try { localStorage.setItem(storageKeyBench(uid, cycleId, moment), '1'); } catch { /* best effort */ } };
const draft = () => (C.status === 'placeholder' ? h('p', { class: 'small muted', 'data-draft': '' }, C.draftLine) : null);

/** The home card, or null (switched off, not the moment, or she said "Not now"). env: { patient, cycle, settings }. */
export async function benchmarkCard({ patient, cycle, settings, rawWeek, doneWorkouts, root, onDone }) {
  if (!benchmarksEnabled(settings)) return null;                         // switched off: no read, nothing shown
  const rows = await allBenchmarks(patient.id).catch(() => []);
  const moment = benchmarkMoment({ settings, rows, cycleId: cycle.id, rawWeek, doneWorkouts });
  if (!moment || dismissed(patient.id, cycle.id, moment)) return null;
  const open = () => { clear(root); renderBenchmarks(root, { patient, cycle, moment, onDone }); screenChange(root); window.scrollTo?.(0, 0); };
  return h('section', { class: 'card soft', 'data-benchmarks': moment },
    h('h2', {}, C.card.title), h('p', {}, C.card.body), draft(), secondary(C.card.cta, open));
}

/** The test screen. Each test: a number (and a version where the test has them) or "Skip this test". */
export function renderBenchmarks(root, { patient, cycle, moment, onDone }) {
  const entries = {};
  const msg = statusLine();
  const form = h('div', { class: 'stack' });
  for (const t of TESTS) {
    const copy = C.tests[t.id];
    const input = h('input', { id: `bench-${t.id}`, type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '3', 'data-bench': t.id });
    entries[t.id] = { input, variant: null, skipped: false };
    const body = h('div', { class: 'stack' },
      h('label', { for: `bench-${t.id}` }, copy.label), input,
      t.variants.length ? choices({ columns: 2, label: copy.variantLabel, value: null,
        options: t.variants.map((v) => ({ value: v, label: copy.variants[v] })), onChange: (v) => { entries[t.id].variant = v; } }) : null);
    const skip = secondary(C.skipOne, () => {
      entries[t.id].skipped = !entries[t.id].skipped;
      input.disabled = entries[t.id].skipped; body.hidden = false;
      skip.setAttribute('aria-pressed', String(entries[t.id].skipped));
      skip.textContent = entries[t.id].skipped ? 'Skipped (tap to undo)' : C.skipOne;
    }, { 'aria-pressed': 'false' });
    form.append(h('section', { class: 'card', 'data-test': t.id }, h('h2', {}, copy.name), h('p', {}, copy.how), body, skip));
  }
  const save = async () => {
    const toSave = [];
    for (const t of TESTS) {
      const e = entries[t.id];
      if (e.skipped || !e.input.value.trim()) continue;
      const value = parseValue(t.id, e.input.value);
      if (value == null) { msg.textContent = `${C.tests[t.id].name}: enter a whole number from 0 to ${t.max}, or skip it.`; e.input.focus(); return; }
      if (t.variants.length && !e.variant) { msg.textContent = `${C.tests[t.id].name}: choose which version you did.`; return; }
      toSave.push({ moment, test: t.id, value, variant: t.variants.length ? e.variant : null });
    }
    if (!toSave.length) { msg.textContent = C.nothing; return; }
    msg.textContent = 'Saving…';
    try {
      for (const r of toSave) await saveBenchmark(patient.id, cycle.id, r);
      onDone?.(C.saved);
    } catch (e) { console.error(e); msg.textContent = C.saveFailed; }
  };
  root.append(
    h('section', { class: 'card hero' }, h('h1', {}, C.card.title), h('p', {}, moment === 'baseline' ? C.baselineLead : C.transitionLead), draft()),
    form, msg,
    h('div', { class: 'actions static' }, primary(C.save, save), secondary(C.later, () => { dismiss(patient.id, cycle.id, moment); onDone?.(null); })),
    h('p', { class: 'small muted warning-signs' }, C.safety));
}

/** The progress-screen section, or null while switched off. */
export async function benchmarkProgressSection({ patient, settings }) {
  if (!benchmarksEnabled(settings)) return null;
  const rows = await allBenchmarks(patient.id).catch(() => []);
  const prog = benchmarkProgress(rows);
  return h('section', { class: 'card', 'data-benchmarks-progress': '' }, h('h2', {}, C.progressTitle),
    prog.length ? h('ul', { class: 'wins' }, prog.map((p) => {
      const copy = C.tests[p.test];
      const vlabel = (r) => (r.variant ? ` (${copy.variants?.[r.variant] ?? r.variant})` : '');
      return h('li', {}, h('span', { class: 'exname' }, copy.name),
        h('span', { class: 'win' }, p.count === 1 ? `${p.first.value} ${p.unit}${vlabel(p.first)}`
          : `${p.first.value} → ${p.latest.value} ${p.unit}${vlabel(p.latest)}`),
        p.count > 1 ? h('span', { class: 'small muted' }, p.sameVariant ? ` · ${C.changeText(p.unit, p.change)}` : ` · ${C.differentVersion}`) : null);
    })) : h('p', { class: 'muted' }, C.progressEmpty), draft());
}
