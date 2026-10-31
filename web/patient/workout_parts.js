// Building blocks for the workout screen: steppers, the weight control, timers and bottom sheets.
import { h } from '../shared/dom.js';
import { primary, secondary } from '../shared/ui.js';
import { step as stepWeight, BAND_LABELS } from '../engine/load.js';
import { DIZZY } from './session_copy.js';

/** − value + control. format(value) → text. Returns { el, get(), set(v) }. */
export function stepper({ value, min = 0, max = 999, by = 1, label, format = String, onChange }) {
  let v = value;
  const out = h('output', { class: 'stepper-value', 'aria-live': 'polite' });
  const paint = () => { out.textContent = v == null ? '–' : format(v); };
  const move = (d) => { v = Math.min(max, Math.max(min, (v ?? min) + d * by)); paint(); onChange?.(v); };
  const el = h('div', { class: 'stepper', role: 'group', 'aria-label': label },
    h('button', { type: 'button', class: 'stepper-btn', 'aria-label': `Less ${label}`, onclick: () => move(-1) }, '−'),
    out,
    h('button', { type: 'button', class: 'stepper-btn', 'aria-label': `More ${label}`, onclick: () => move(1) }, '+'));
  paint();
  return { el, get: () => v, set: (x) => { v = x; paint(); } };
}

/**
 * The weight control for one exercise. Dumbbells/kettlebells step through real weights (her own set at home);
 * bands step through resistance levels; machines, cables and barbells take a typed number with ± steps.
 * Returns { el, get(), set(v) } or null for bodyweight.
 */
export function weightControl(loadType, value, { dumbbells = [], ageBand, lower } = {}) {
  if (loadType === 'bodyweight') return null;
  if (loadType === 'band') {
    return stepper({ value: value ?? 2, min: 1, max: 5, label: 'band', format: (b) => `${BAND_LABELS[b]} band` });
  }
  const opts = { ageBand, lower, available: loadType === 'dumbbell' && dumbbells.length ? dumbbells : undefined };
  let v = value;
  const input = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', class: 'weight-input', placeholder: 'lb',
    'aria-label': 'Weight in pounds', value: v ?? '' });
  input.addEventListener('input', () => { v = input.value === '' ? null : Number(input.value); });
  const move = (n) => {
    if (v == null) v = opts.available?.[0] ?? (loadType === 'dumbbell' ? 5 : loadType === 'kettlebell' ? 9 : 10);
    else v = stepWeight(loadType, v, n, opts);
    input.value = v;
  };
  const el = h('div', { class: 'stepper', role: 'group', 'aria-label': 'Weight' },
    h('button', { type: 'button', class: 'stepper-btn', 'aria-label': 'Lighter', onclick: () => move(-1) }, '−'),
    h('label', { class: 'weight-wrap' }, input, h('span', { class: 'unit' }, 'lb')),
    h('button', { type: 'button', class: 'stepper-btn', 'aria-label': 'Heavier', onclick: () => move(1) }, '+'));
  return { el, get: () => v, set: (x) => { v = x; input.value = x ?? ''; } };
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Suggested rest (never enforced, §6). Calls onDone when she taps Ready or time runs out. */
export function restTimer(seconds, onDone) {
  let left = seconds;
  const out = h('span', { class: 'rest-time' }, mmss(left));
  const finish = () => { clearInterval(t); el.remove(); onDone?.(); };
  const t = setInterval(() => { left -= 1; out.textContent = mmss(Math.max(0, left)); if (left <= 0) finish(); }, 1000);
  const el = h('div', { class: 'rest card soft', role: 'timer' },
    h('div', {}, h('p', { class: 'small muted' }, 'Rest, sip some water'), out),
    h('div', { class: 'row' },
      secondary('+30 s', () => { left += 30; out.textContent = mmss(left); }),
      primary('Ready', finish)));
  return el;
}

/** Count-up timer for holds and carries. onStop(seconds). */
export function holdTimer(onStop) {
  let t = null; let s = 0;
  const out = h('span', { class: 'rest-time' }, '0:00');
  const btn = primary('Start timer', () => {
    if (t) { clearInterval(t); t = null; btn.textContent = 'Start timer'; onStop(s); return; }
    s = 0; out.textContent = '0:00'; btn.textContent = 'Stop';
    t = setInterval(() => { s += 1; out.textContent = mmss(s); }, 1000);
  });
  return h('div', { class: 'row hold' }, out, btn);
}

/** A bottom sheet over the page. content: nodes. Returns close(). */
export function openSheet(title, content, { onClose } = {}) {
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', {}, title), ...content);
  const back = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === back) close(); } }, sheet);
  document.body.append(back);
  document.addEventListener('keydown', esc);
  sheet.querySelector('button')?.focus();
  return close;
}

/**
 * The "I feel dizzy or unwell" sheet (S4): stop guidance first, then the flag goes to the team in the background.
 * onKeepGoing / onEnd are the two ways out.
 */
export function dizzySheet({ raise, onKeepGoing, onEnd }) {
  const status = h('p', { class: 'small muted', role: 'status' }, 'Letting the program team know…');
  let close = () => {};
  close = openSheet(DIZZY.title, [
    h('ol', { class: 'dizzy-steps' }, DIZZY.steps.map((t) => h('li', {}, t))),
    h('p', { class: 'urgent' }, DIZZY.urgent),
    status,
    h('div', { class: 'stack' },
      secondary('I feel OK now. Keep going', () => { close(); onKeepGoing?.(); }),
      primary('End today’s workout', () => { close(); onEnd?.(); })),
  ]);
  Promise.resolve().then(raise).then(() => { status.textContent = DIZZY.flagged; })
    .catch(() => { status.textContent = 'Couldn’t reach the team right now. If you need help, contact your clinic.'; });
}
