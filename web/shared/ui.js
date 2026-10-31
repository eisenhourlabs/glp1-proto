// Small UI building blocks shared by the patient flows. Big tap targets, plain language.
import { h } from './dom.js';

/** A step screen: progress bar, title, lead text, body, and an action row. */
export function stepScreen({ step, total, title, lead, body = [], actions = [] }) {
  return h('section', { class: 'step' },
    total ? h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': step },
      h('span', { style: `width:${Math.round((step / total) * 100)}%` })) : null,
    h('h1', {}, title),
    lead ? h('p', { class: 'lead' }, lead) : null,
    h('div', { class: 'stack' }, ...body),
    actions.length ? h('div', { class: 'actions' }, ...actions) : null);
}

/**
 * Tap-to-choose options. single: one value (string|null); multi: array of values.
 * options: [{ value, label, hint? }]. onChange receives the new value.
 */
export function choices({ options, value, multi = false, onChange, columns = 1, label }) {
  let current = multi ? [...(value || [])] : value;
  const wrap = h('div', { class: `choices cols-${columns}`, role: multi ? 'group' : 'radiogroup', 'aria-label': label || null });
  const paint = () => {
    for (const btn of wrap.children) {
      const v = btn.dataset.value;
      btn.setAttribute('aria-pressed', String(multi ? current.includes(v) : current === v));
    }
  };
  for (const o of options) {
    wrap.append(h('button', {
      type: 'button', class: 'choice', 'data-value': o.value,
      onclick: () => {
        if (multi) current = current.includes(o.value) ? current.filter((x) => x !== o.value) : [...current, o.value];
        else current = o.value;
        paint();
        onChange?.(multi ? [...current] : current);
      },
    }, h('span', { class: 'choice-label' }, o.label), o.hint ? h('span', { class: 'choice-hint' }, o.hint) : null));
  }
  paint();
  return wrap;
}

export const primary = (label, onclick, attrs = {}) => h('button', { type: 'button', class: 'btn btn-primary', onclick, ...attrs }, label);
export const secondary = (label, onclick, attrs = {}) => h('button', { type: 'button', class: 'btn btn-quiet', onclick, ...attrs }, label);

/** Typed-name signature field with a label. Returns { el, value() }. */
export function signatureField(label = 'Type your full name to sign') {
  const input = h('input', { type: 'text', autocomplete: 'name', 'aria-label': label, minlength: 2, maxlength: 120 });
  return { el: h('label', { class: 'stack sign' }, h('span', {}, label), input), value: () => input.value.trim() };
}

/** A small status line for errors/progress inside a step. */
export const statusLine = () => h('p', { class: 'form-msg', role: 'status' });
