// Open flags across all patients: dizzy / pain reports, pattern flags, screening pauses. Resolve when handled.
import { h } from '../shared/dom.js';
import { secondary } from '../shared/ui.js';
import { openFlags, resolveFlag } from './api.js';
import { pill } from './patients.js';

const area = (a) => (a ? a.replace(/_/g, ' ') : '');

/** One line describing a flag from its type and detail. */
export function flagText(f) {
  const d = f.detail || {};
  switch (f.type) {
    case 'dizzy': return 'Felt dizzy or unwell during a workout.';
    case 'pain': return `Reported pain${d.area ? ` (${area(d.area)})` : ''}${d.exercise_id ? ` on ${d.exercise_id}` : ''}.`;
    case 'pattern':
      if (d.reason === 'area_repeat') return `${area(d.area)} flagged ${d.count} times in 14 days${d.pain ? ', including pain' : ''}.`;
      if (d.reason === 'second_lighter_week_trigger') return `A second lighter-week trigger this cycle (week ${d.week}). Review her programming.`;
      return d.reason ? d.reason.replace(/_/g, ' ') : 'Pattern flag.';
    case 'screening': return 'Health screening answer paused her program.';
    case 'problem': return d.text ?? 'Reported a problem.';
    default: return d.text ?? '';
  }
}

export async function renderFlags(root, { admin }) {
  const { flags, people } = await openFlags();
  const list = h('ul', { class: 'list' });
  const paint = (items) => {
    list.replaceChildren(...items.map((f) => h('li', { class: 'flag open' },
      h('div', {},
        h('a', { href: `#patient/${f.patient_id}` }, people[f.patient_id]?.display_name ?? 'Patient'),
        h('span', { class: 'muted small' }, ` · ${people[f.patient_id]?.clinics?.name ?? ''}`),
        h('div', {}, pill(f.type, f.type === 'pattern' ? 'warn' : 'danger'), ' ', flagText(f)),
        h('div', { class: 'small muted' }, new Date(f.created_at).toLocaleString())),
      secondary('Resolve', async (e) => {
        e.target.disabled = true;
        await resolveFlag(f.id, admin.id);
        items = items.filter((x) => x.id !== f.id);
        paint(items);
      }))));
    if (!items.length) list.append(h('li', { class: 'muted' }, 'No open flags.'));
  };
  root.append(h('section', { class: 'card' },
    h('h1', {}, 'Open flags'),
    h('p', { class: 'small muted' }, 'Dizzy and pain reports, repeated problem areas, and screening pauses. Resolve a flag once someone has followed up.'),
    list));
  paint(flags);
}
