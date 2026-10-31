// Patient list: who's active, who's slipping, who's worth a check-in call, open flags. Filter by clinic and status.
import { h, clear } from '../shared/dom.js';
import { patientRow } from '../engine/report.js';
import { patientOverview, clinics as loadClinics, loadContent, localToday } from './api.js';

const STATUS = { onboarding: 'Onboarding', paused: 'Paused', active: 'Active', inactive: 'Inactive' };
const fmt = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');

export async function renderPatients(root) {
  const [data, clinics, content] = await Promise.all([patientOverview(), loadClinics(), loadContent()]);
  const today = localToday();
  const clinicName = Object.fromEntries(clinics.map((c) => [c.id, c.name]));
  const templates = Object.fromEntries(content.templates.map((t) => [t.template_id, t]));
  const profiles = Object.fromEntries(data.profiles.map((p) => [p.id, p]));
  const rows = data.patients.map((patient) => {
    const cycle = data.cycles.find((c) => c.patient_id === patient.id) ?? null;
    return patientRow({
      patient, profile: profiles[patient.id], cycle, today,
      logs: data.logs.filter((l) => l.patient_id === patient.id),
      openFlags: data.flags.filter((f) => f.patient_id === patient.id).length,
      perWeek: (cycle && templates[cycle.template_id]?.days_per_week) || patient.days_per_week || 3,
    });
  }).sort((a, b) => (b.openFlags - a.openFlags) || (Number(b.checkInCall) - Number(a.checkInCall)) || a.name.localeCompare(b.name));

  const f = { clinic: '', status: '', attention: false };
  const select = (label, options, key) => {
    const s = h('select', { 'aria-label': label }, h('option', { value: '' }, `All ${label.toLowerCase()}`), options.map(([v, t]) => h('option', { value: v }, t)));
    s.addEventListener('change', () => { f[key] = s.value; paint(); });
    return s;
  };
  const attention = h('input', { type: 'checkbox', id: 'att' });
  attention.addEventListener('change', () => { f.attention = attention.checked; paint(); });
  const tbody = h('tbody', {});
  const count = h('p', { class: 'small muted' });

  const paint = () => {
    const shown = rows.filter((r) => (!f.clinic || r.clinicId === f.clinic) && (!f.status || r.status === f.status)
      && (!f.attention || r.openFlags || r.checkInCall || r.slipping || r.status === 'paused'));
    count.textContent = `${shown.length} of ${rows.length} patients`;
    clear(tbody).append(...shown.map((r) => h('tr', {},
      h('td', {}, h('a', { href: `#patient/${r.id}` }, r.name)),
      h('td', {}, clinicName[r.clinicId] ?? '—'),
      h('td', {}, pill(STATUS[r.status] ?? r.status, r.status)),
      h('td', {}, r.week ? `${Math.min(r.week, 9)}${r.week > 9 ? '+' : ''}` : '—'),
      h('td', {}, r.week ? `${r.thisWeek} / ${r.perWeek}` : '—'),
      h('td', {}, r.adherence == null ? '—' : `${r.adherence}%`),
      h('td', {}, fmt(r.lastWorkout), r.daysSince != null ? h('span', { class: 'muted small' }, ` (${r.daysSince}d)`) : null),
      h('td', { class: 'tags' },
        r.openFlags ? pill(`${r.openFlags} flag${r.openFlags > 1 ? 's' : ''}`, 'danger') : null,
        r.checkInCall ? pill('Call', 'warn') : r.slipping ? pill('Slipping', 'warn') : null))));
    if (!shown.length) tbody.append(h('tr', {}, h('td', { colspan: 8, class: 'muted' }, 'No patients match.')));
  };

  root.append(h('section', { class: 'card' },
    h('h1', {}, 'Patients'),
    h('div', { class: 'row filters' },
      select('Clinics', clinics.map((c) => [c.id, c.name]), 'clinic'),
      select('Statuses', Object.entries(STATUS), 'status'),
      h('label', { class: 'row check', for: 'att' }, attention, h('span', {}, 'Needs attention'))),
    count,
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, ...['Name', 'Clinic', 'Status', 'Week', 'This week', '14-day', 'Last workout', ''].map((t) => h('th', {}, t)))),
      tbody)),
    h('p', { class: 'small muted' }, '14-day = workouts done ÷ planned over the last 14 days. Call = no workout in 7+ days. Slipping = under 50% over 14 days.')));
  paint();
}

export const pill = (text, kind = '') => h('span', { class: `pill ${kind}` }, text);
