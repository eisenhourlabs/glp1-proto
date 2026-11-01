// AI cycle reviews: pending proposals first (validator errors or outside the auto-apply bounds), then recent ones.
// Approve the AI plan or use the standard plan. Either way she's never blocked: pending ones run the standard plan
// until decided.
import { h } from '../shared/dom.js';
import { primary, secondary, statusLine } from '../shared/ui.js';
import { proposalLines, CYCLE_NAMES } from '../engine/review.js';
import { db } from '../shared/supa.js';
import { loadContent } from './api.js';
import { pill } from './patients.js';

const must = ({ data, error }) => { if (error) throw error; return data; };
const STATUS_KIND = { pending: 'warn', ready: 'active', approved: 'active', rejected: '' };

export async function renderAiReviews(root) {
  const [rows, content] = await Promise.all([
    db.from('ai_proposals').select('*').order('created_at', { ascending: false }).limit(100).then(must),
    loadContent(),
  ]);
  const ids = [...new Set(rows.map((r) => r.patient_id))];
  const people = ids.length ? Object.fromEntries(must(await db.from('profiles').select('id, display_name').in('id', ids)).map((p) => [p.id, p.display_name])) : {};
  const pending = rows.filter((r) => r.status === 'pending');
  const rest = rows.filter((r) => r.status !== 'pending');
  root.append(
    h('section', { class: 'card' },
      h('h1', {}, 'AI cycle reviews'),
      h('p', { class: 'small muted' }, 'At week 9 each patient’s cycle is reviewed. Plans that pass every rule are applied automatically. The rest wait here; until you decide, she gets the standard plan (next cycle in sequence, levels unchanged).'),
      h('h2', {}, `Waiting for you (${pending.length})`),
      pending.length ? h('div', {}, pending.map((r) => card(r, people, content, root))) : h('p', { class: 'muted' }, 'Nothing waiting.')),
    h('section', { class: 'card' }, h('h2', {}, 'Recent'),
      rest.length ? h('div', {}, rest.map((r) => card(r, people, content, root))) : h('p', { class: 'muted' }, 'No reviews yet.')));
}

function plan(p, library) {
  if (!p || p.invalid !== undefined) return h('p', { class: 'muted' }, 'Unusable AI output (kept for the record).');
  return h('div', { class: 'stack' },
    h('p', {}, h('strong', {}, `${p.cycle_type} ${CYCLE_NAMES[p.cycle_type] ?? ''}`), ` · ${p.days_per_week} days · focus: ${p.focus}`),
    proposalLines(p, library).length ? h('ul', { class: 'exlist' }, proposalLines(p, library).map((l) => h('li', {}, l))) : h('p', { class: 'small muted' }, 'No level changes or swaps.'),
    h('p', { class: 'card soft small' }, p.recap));
}

function card(r, people, content, root) {
  const msg = statusLine();
  const note = h('input', { type: 'text', maxlength: 500, placeholder: 'Note (optional)', 'aria-label': 'Review note' });
  const decide = (approve) => async (e) => {
    e.target.disabled = true;
    try {
      must(await db.rpc('admin_review_proposal', { p_id: r.id, p_approve: approve, p_note: note.value.trim() || null }));
      root.replaceChildren(); await renderAiReviews(root);
    } catch (err) { console.error(err); msg.textContent = 'Couldn’t save the decision.'; e.target.disabled = false; }
  };
  const v = r.validation || { errors: [], review: [] };
  return h('article', { class: 'proposal' },
    h('div', { class: 'row between' },
      h('div', {}, h('a', { href: `#patient/${r.patient_id}` }, people[r.patient_id] ?? 'Patient'),
        h('span', { class: 'small muted' }, ` · cycle ${r.input_summary?.cycle?.number ?? '?'} · ${new Date(r.created_at).toLocaleDateString()}`)),
      h('span', { class: 'row' }, pill(r.status, STATUS_KIND[r.status]), pill(r.source === 'ai' ? (r.model ?? 'AI') : 'standard plan'),
        r.applied_cycle_id ? pill('started', 'active') : null)),
    r.ai_error ? h('p', { class: 'small muted' }, `AI not used: ${r.ai_error === 'no_api_key' ? 'no API key set' : r.ai_error}`) : null,
    v.errors.length ? h('div', {}, h('p', { class: 'small' }, h('strong', {}, 'Rule problems')), h('ul', { class: 'small' }, v.errors.map((x) => h('li', {}, x)))) : null,
    v.review.length ? h('div', {}, h('p', { class: 'small' }, h('strong', {}, 'Outside auto-apply bounds')), h('ul', { class: 'small' }, v.review.map((x) => h('li', {}, x)))) : null,
    h('div', { class: 'grid-2' },
      h('div', {}, h('h3', {}, r.source === 'ai' ? 'AI plan' : 'Plan'), plan(r.output, content.library)),
      r.status === 'pending' ? h('div', {}, h('h3', {}, 'Standard plan'), plan(r.default_output, content.library)) : null),
    r.reflection?.note ? h('p', { class: 'small' }, h('strong', {}, 'Her note: '), r.reflection.note) : null,
    h('details', { class: 'small' }, h('summary', {}, 'What the AI saw (de-identified summary)'), h('pre', { class: 'json' }, JSON.stringify(r.input_summary, null, 1))),
    r.status === 'pending' ? h('div', { class: 'row filters' }, note,
      primary('Approve AI plan', decide(true), { disabled: v.errors.length ? true : null, title: v.errors.length ? 'It breaks a rule, so it can’t be approved as-is' : null }),
      secondary('Use standard plan', decide(false)), msg) : (r.review_note ? h('p', { class: 'small muted' }, `Note: ${r.review_note}`) : null));
}
