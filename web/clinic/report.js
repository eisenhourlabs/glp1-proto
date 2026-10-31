// The clinic dashboard and monthly report. Data comes only from the clinic_report() and clinic_checkin_list()
// functions, which always scope to the viewer's own clinic (admins pass a clinic id). Used by /clinic and /admin.
import { db } from '../shared/supa.js';
import { h } from '../shared/dom.js';
import { primary } from '../shared/ui.js';
import { SKIP_REASONS } from '../engine/report.js';

const must = ({ data, error }) => { if (error) throw error; return data; };
const day = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

/** @param {object} o { clinicId (admins only), today (ISO date) } */
export async function renderClinicReport(root, { clinicId = null, today } = {}) {
  const args = { p_clinic: clinicId, ...(today ? { p_today: today } : {}) };
  const [r, list] = await Promise.all([db.rpc('clinic_report', args).then(must), db.rpc('clinic_checkin_list', args).then(must)]);
  const month = new Date(`${r.as_of}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const perActive = r.active_28d ? (r.workouts_28d / r.active_28d / 4).toFixed(1) : '—';
  const call = list.filter((x) => x.worth_a_call);
  const weeks = r.weekly || [];

  root.append(
    h('section', { class: 'card hero' },
      h('div', { class: 'row between' },
        h('div', {}, h('p', { class: 'eyebrow' }, `Patient program · ${month}`), h('h1', {}, r.clinic)),
        primary('Print report', () => window.print(), { class: 'btn btn-primary no-print' })),
      h('div', { class: 'stats stats-4' },
        stat(r.enrolled, 'enrolled'),
        stat(r.activated, 'finished setup'),
        stat(`${pct(r.active_7d, r.active_now) ?? '—'}${r.active_now ? '%' : ''}`, `active this week (${r.active_7d} of ${r.active_now})`),
        stat(perActive, 'workouts per active patient per week')),
      h('p', { class: 'small muted' }, `As of ${day(r.as_of)}. “Active” means at least one workout in the last 7 days.`)),

    h('section', { class: 'card' },
      h('h2', {}, 'Workouts done vs planned, by week'),
      h('div', { class: 'bars', role: 'img', 'aria-label': 'Weekly adherence' }, weeks.map((w, i) => {
        const p = pct(w.completed, w.planned);
        const current = i === weeks.length - 1;
        return h('div', { class: 'bar-col' },
          h('div', { class: 'bar-track' }, h('div', { class: `bar${current ? ' current' : ''}`, style: `height:${Math.min(100, p ?? 0)}%` })),
          h('span', { class: 'bar-val' }, p == null ? '—' : `${p}%`),
          h('span', { class: 'bar-label' }, current ? 'This wk' : day(w.week_start)));
      })),
      h('p', { class: 'small muted' }, 'Completed ÷ planned workouts for patients who had started by that week. This week is so far.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Getting stronger'),
      r.strength?.patients_with_data
        ? h('p', {}, `${r.strength.patients_stronger} of ${r.strength.patients_with_data} patients with tracked lifts are lifting more than when they started`,
          r.strength.avg_load_change_pct != null ? ` (average change ${r.strength.avg_load_change_pct > 0 ? '+' : ''}${r.strength.avg_load_change_pct}%).` : '.')
        : h('p', { class: 'muted' }, 'Strength trends appear once patients have a few weeks of workouts.')),

    h('section', { class: 'card' },
      h('h2', {}, `Worth a check-in call (${call.length})`),
      h('p', { class: 'small muted' }, 'Active patients with no workout in 7 or more days. A friendly call helps people get back on track.'),
      call.length ? table(['Patient', 'Last workout', 'Days', 'Last reason given'], call.map((x) => [
        x.patient_name, day(x.last_workout), x.days_since ?? 'none yet', SKIP_REASONS[x.last_skip_reason] ?? '—']))
        : h('p', { class: 'muted' }, 'Nobody right now.')),

    h('section', { class: 'card' },
      h('h2', {}, 'All patients'),
      table(['Patient', 'Status', 'Joined', 'This week', 'Last week', 'Last 4 weeks', 'Last workout', 'Last reason given'], list.map((x) => [
        x.patient_name, x.status, day(x.joined), x.workouts_this_week, x.workouts_last_week, x.workouts_28d, day(x.last_workout),
        x.last_skip_reason ? `${SKIP_REASONS[x.last_skip_reason] ?? x.last_skip_reason} (${day(x.last_skip_date)})` : '—'])),
      h('p', { class: 'small muted' }, 'Shows only what patients agreed to share when they joined: that they’ve joined, whether they’re active, workouts per week and the reason picked when skipping. No health answers, weights or notes.')),
  );
}

const stat = (big, small) => h('div', { class: 'stat' }, h('span', { class: 'stat-big' }, String(big)), h('span', { class: 'stat-small' }, small));

function table(head, rows) {
  if (!rows.length) return h('p', { class: 'muted' }, 'No patients yet.');
  return h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
    h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, String(c ?? '—'))))))));
}
