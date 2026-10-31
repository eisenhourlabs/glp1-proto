// Home: her program at a glance. (The week queue and workout logger arrive in the next build step.)
import { h } from '../shared/dom.js';
import { swapNote } from '../engine/resolve.js';
import { weekOfCycle } from '../engine/cycle.js';
import { loadContent, localToday } from './api.js';

const GOALS = {
  keep_muscle: 'Keep my muscle while I lose weight', everyday_strength: 'Make everyday life easier',
  look_feel: 'Feel stronger and more toned', habit: 'Build a habit I’ll keep',
};

export async function renderHome(root, { patient, cycle }) {
  const content = await loadContent();
  const ex = Object.fromEntries(content.library.map((e) => [e.id, e]));
  const template = content.templates.find((t) => t.template_id === cycle.template_id);
  const week = Math.max(1, weekOfCycle(cycle.start_date, localToday()));
  const sessions = template.sessions.map(({ session, name }) => ({
    session, name, items: cycle.items.filter((i) => i.session === session).sort((a, b) => a.ord - b.ord),
  }));
  root.append(
    h('section', { class: 'card hero' },
      h('p', { class: 'eyebrow' }, `${template.name} · Week ${Math.min(week, 9)} of 9`),
      h('h1', {}, 'Your program'),
      patient.goal ? h('p', { class: 'goal' }, `Your goal: ${GOALS[patient.goal]}`, patient.goal_words ? ` · “${patient.goal_words}”` : '') : null),
    ...sessions.map((s) => h('section', { class: 'card' },
      h('h2', {}, s.name),
      h('ol', { class: 'exlist' }, s.items.filter((i) => i.exercise_id).map((i) => {
        const e = ex[i.exercise_id];
        const note = swapNote(i.reasons || []);
        return h('li', {}, h('span', { class: 'exname' }, e?.name ?? i.exercise_id), note ? h('span', { class: 'note' }, note) : null);
      })))),
    h('p', { class: 'muted small center' }, 'Workout screens with your suggested weights are coming next in this prototype.'),
  );
}
