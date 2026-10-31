// One patient: profile, cycle progress, workouts with check-ins and notes, adjustments with reasons, flags, documents,
// and strength wins. Read-only except resolving flags.
import { h } from '../shared/dom.js';
import { secondary } from '../shared/ui.js';
import { weekOfCycle } from '../engine/cycle.js';
import { weeklyCounts, streaks, strengthWins } from '../engine/progress.js';
import { recentAdherence, SKIP_REASONS } from '../engine/report.js';
import { patientDetail, loadContent, localToday, resolveFlag } from './api.js';
import { pill } from './patients.js';
import { flagText } from './flags.js';

const fmt = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const short = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const words = (a) => (a?.length ? a.map((x) => x.replace(/_/g, ' ')).join(', ') : 'none');
const FEEL = { too_easy: 'Too easy', right: 'About right', too_hard: 'Too hard' };
const SORE = { none: 'none', some: 'some', a_lot: 'a lot' };

export async function renderPatient(root, { id, admin }) {
  const [d, content] = await Promise.all([patientDetail(id), loadContent()]);
  const today = localToday();
  const p = d.patient;
  const cycle = d.cycles.find((c) => c.status === 'active') ?? d.cycles[d.cycles.length - 1] ?? null;
  const template = cycle && content.templates.find((t) => t.template_id === cycle.template_id);
  const perWeek = template?.days_per_week ?? p.days_per_week ?? 3;
  const week = cycle ? weekOfCycle(cycle.start_date, today) : 0;
  const cycleLogs = cycle ? d.logs.filter((l) => l.cycle_id === cycle.id) : [];
  const weeks = cycle ? weeklyCounts(cycleLogs, Math.max(1, week), perWeek) : [];
  const s = streaks(weeks, Math.max(1, week));
  const recent = recentAdherence(d.logs, perWeek, cycle?.start_date ?? p.start_date, today);
  const wins = strengthWins(d.exLogs, content.library, 10);

  root.replaceChildren();
  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v ?? '—')]));

  root.append(
    h('p', {}, h('a', { href: '#patients' }, '← All patients')),
    h('section', { class: 'card' },
      h('h1', {}, d.profile.display_name ?? 'Patient', d.profile.is_demo ? ' (demo)' : ''),
      h('p', { class: 'muted' }, d.profile.clinics?.name ?? '—', ' · ', pill(p.status, p.status),
        p.screening_flag !== 'none' ? [' ', pill(`screening: ${p.screening_flag}`, p.screening_flag === 'pause' ? 'danger' : '')] : null),
      h('div', { class: 'grid-2' },
        kv([['Age band', p.age_band], ['Experience', p.experience], ['Goal', [p.goal?.replace(/_/g, ' '), p.goal_words ? ` · “${p.goal_words}”` : ''].join('')],
          ['Schedule', `${p.days_per_week ?? '—'} days · ${p.session_minutes ?? '—'} min`], ['Setup', p.setup?.replace(/_/g, ' ')]]),
        kv([['Equipment', words(p.equipment)], ['Dumbbells', p.dumbbells_available?.length ? `${p.dumbbells_available.join(', ')} lb` : '—'],
          ['Work-arounds', words(p.workarounds)], ['Restrictions', words(p.restrictions)], ['Floor work', p.floor_ok ? 'yes' : 'not yet']])),
      h('p', { class: 'small muted' }, 'Pattern levels: ', Object.entries(p.pattern_levels || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—')),

    cycle ? h('section', { class: 'card' },
      h('h2', {}, `Cycle ${cycle.cycle_no} · ${template?.name ?? cycle.template_id}`),
      h('p', { class: 'muted' }, `Started ${fmt(cycle.start_date)} · week ${Math.min(Math.max(week, 1), 9)} of 9 · `,
        `14-day adherence ${recent.pct ?? '—'}% · streak ${s.current} (best ${s.best}) · ${s.total} workouts`),
      Object.keys(cycle.week_modes || {}).length
        ? h('p', { class: 'small' }, 'Week decisions: ', Object.entries(cycle.week_modes).map(([w, m]) => `week ${w}: ${m.mode}${m.restReasons?.length ? ` (${m.restReasons.join(', ')})` : ''}`).join(' · '))
        : null,
      h('ol', { class: 'weeks' }, weeks.map((w) => h('li', { class: 'week-row' }, h('span', { class: 'week-n' }, `Week ${w.week}`),
        h('span', { class: 'dots' }, Array.from({ length: w.planned }, (_, i) => h('span', { class: `dot${i < w.done ? ' on' : ''}` }))))))) : null,

    h('section', { class: 'card' },
      h('h2', {}, 'Workouts and check-ins'),
      d.logs.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, ...['Date', 'Workout', 'Status', 'Energy', 'Felt', 'Soreness', 'Work-around', 'Note'].map((t) => h('th', {}, t)))),
        h('tbody', {}, d.logs.map((l) => h('tr', {},
          h('td', { class: 'nowrap' }, short(l.log_date)),
          h('td', {}, l.session ? `${l.session}${l.week ? ` · wk ${l.week}` : ''}` : '—'),
          h('td', {}, l.status, l.scaled ? ' (scaled)' : '', l.skip_reason ? ` · ${SKIP_REASONS[l.skip_reason] ?? l.skip_reason}` : ''),
          h('td', {}, l.energy ?? '—'),
          h('td', {}, FEEL[l.feel] ?? '—'),
          h('td', {}, l.soreness ? `${SORE[l.soreness]}${l.sore_areas?.length ? ` (${words(l.sore_areas)})` : ''}` : '—'),
          h('td', {}, l.workaround_areas?.length ? words(l.workaround_areas) : '—'),
          h('td', { class: 'note-cell' }, l.note ?? '')))))) : h('p', { class: 'muted' }, 'No workouts yet.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Flags'),
      d.flags.length ? h('ul', { class: 'list' }, d.flags.map((f) => flagItem(f, admin, () => renderPatient(root, { id, admin }))))
        : h('p', { class: 'muted' }, 'No flags.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Adjustments'),
      d.adjustments.length ? h('ul', { class: 'list' }, d.adjustments.map((a) => h('li', {},
        h('strong', {}, a.type.replace(/_/g, ' ')), ` · ${a.reason.replace(/_/g, ' ')} · ${fmt(a.created_at)}`,
        Object.keys(a.detail || {}).length ? h('span', { class: 'small muted' }, ` ${JSON.stringify(a.detail)}`) : null)))
        : h('p', { class: 'muted' }, 'None yet.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Getting stronger'),
      wins.length ? h('ul', { class: 'wins' }, wins.map((w) => h('li', {}, h('span', {}, w.name), h('span', { class: 'win' }, `${w.from} → ${w.to}`))))
        : h('p', { class: 'muted' }, 'Not enough history yet.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Signed documents'),
      h('ul', { class: 'list' }, d.docs.map((x) => h('li', {}, `${x.doc_type} · ${x.doc_version} · ${fmt(x.signed_at)}`)))),
  );
}

function flagItem(f, admin, onChange) {
  const open = !f.resolved_at;
  return h('li', { class: open ? 'flag open' : 'flag' },
    h('div', {}, pill(f.type, f.type === 'dizzy' || f.type === 'pain' || f.type === 'screening' ? 'danger' : 'warn'), ' ', flagText(f),
      h('div', { class: 'small muted' }, fmt(f.created_at), open ? '' : ` · resolved ${fmt(f.resolved_at)}`)),
    open ? secondary('Resolve', async (e) => { e.target.disabled = true; await resolveFlag(f.id, admin.id); onChange(); }) : null);
}

