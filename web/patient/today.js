// Before a workout: the 2-tap readiness check (Framework §9) and building today's plan from the cycle, her history
// and today's answers.
import { h } from '../shared/dom.js';
import { stepScreen, choices, primary, secondary, statusLine } from '../shared/ui.js';
import { baseItems, planSession, applyHold } from '../engine/session.js';
import { makeEasier, applyWorkarounds, applySoreness, scaleToday } from '../engine/readiness.js';
import { isSixtyPlus } from '../engine/util.js';
import { engineProfile } from './api.js';
import { exerciseHistory } from './log_api.js';
import { PRE_SESSION, ENERGY_OPTIONS, AREA_OPTIONS, SCALE_TODAY } from './session_copy.js';

/**
 * A planner for one workout. env: { patient, cycle, content, settings, week, weekMode, comeback, excludeSession }
 * today: { energy, areas: [], scale: bool, easier: bool, soreAreas: [] }
 */
export function makePlanner(env, today) {
  const { patient, cycle, content, settings, week, weekMode, comeback } = env;
  const profile = engineProfile(patient);
  const lib = content.library;
  const ctx = (history) => ({
    week: Math.min(week, 9), weekMode, cycleType: cycle.cycle_type, ageBand: patient.age_band,
    dumbbells: (patient.dumbbells_available || []).map(Number), comeback, history, settings,
  });
  const plan = async (items) => {
    const ids = [...new Set(items.map((it) => it.exercise.id))];
    const history = await exerciseHistory(patient.id, ids, { excludeSession: env.excludeSession ?? null });
    let out = planSession(items, ctx(history));
    out = applyHold(applySoreness(out, today.soreAreas || []).items);
    return today.scale ? scaleToday(out, settings) : out;
  };
  return {
    profile, lib,
    /** Today's items for a session, in order. */
    async build(session) {
      const slots = content.slots.filter((s) => s.template_id === cycle.template_id);
      let items = baseItems(cycle.items, session, slots, lib);
      if (today.easier) items = makeEasier(items, profile, lib);
      if (today.areas?.length) items = applyWorkarounds(items, today.areas, profile, lib).items;
      return plan(items.filter((it) => it.exercise));
    },
    /** One item with a different exercise (her swap). */
    async replan(item, exercise) {
      const [out] = await plan([{ slot: item.slot, exercise, reasons: [] }]);
      return out;
    },
    /** Work around an area for the rest of today: items that load it heavily swap, or drop if nothing fits. */
    async workaround(items, area) {
      const areas = [...new Set([...(today.areas || []), area])];
      today.areas = areas;
      const { items: next } = applyWorkarounds(items, areas, profile, lib);
      const changed = next.map((it, i) => (it.exercise && it.exercise.id !== items[i].exercise?.id ? i : -1)).filter((i) => i >= 0);
      const replanned = changed.length ? await plan(changed.map((i) => next[i])) : [];
      return next.map((it, i) => {
        const k = changed.indexOf(i);
        return k >= 0 ? { ...replanned[k], swappedFor: area } : it;
      });
    },
  };
}

/** The warm-up that fits her setup and age band (§6). */
export function warmupFor(warmups, patient) {
  const sixty = isSixtyPlus(patient.age_band);
  const fits = (w) => w.age_band !== 'all' && (sixty ? w.age_band === '60+' : w.age_band !== '60+')
    && (w.setups.includes('all') || w.setups.includes(patient.setup));
  return warmups.find(fits) ?? warmups.find((w) => w.age_band !== 'all') ?? null;
}

/**
 * The readiness screen. onStart({ energy, areas, scale, easier }) begins the workout; onBack returns home.
 */
export function renderReadiness(root, { sessionName, onStart, onBack }) {
  const a = { energy: null, areas: [], scale: false, easier: false };
  const msg = statusLine();
  const scaleBox = h('div', {});
  const paintScale = () => {
    scaleBox.replaceChildren();
    if (a.energy !== 'low') { a.scale = false; a.easier = false; return; }
    scaleBox.append(h('div', { class: 'card soft' },
      h('h2', {}, SCALE_TODAY.title), h('p', {}, SCALE_TODAY.lead),
      choices({ value: a.scale ? 'yes' : 'no', columns: 2, onChange: (v) => { a.scale = v === 'yes'; },
        options: [{ value: 'yes', label: 'Yes, scale today' }, { value: 'no', label: 'No, as planned' }] }),
      choices({ multi: true, value: a.easier ? ['easier'] : [], onChange: (v) => { a.easier = v.includes('easier'); },
        options: [{ value: 'easier', label: 'Also make the exercises easier today' }] }),
      h('p', { class: 'small muted' }, SCALE_TODAY.counts)));
  };
  let areasPicked = false;
  const areaChoices = choices({ multi: true, columns: 2, value: [], label: 'Areas to work around', onChange: (v) => {
    const hadNone = a.areas.includes('none');
    a.areas = v.includes('none') && !hadNone ? ['none'] : v.filter((x) => x !== 'none');
    areasPicked = true;
    for (const b of areaChoices.children) b.setAttribute('aria-pressed', String(a.areas.includes(b.dataset.value)));
  }, options: [...AREA_OPTIONS, { value: 'none', label: 'Nothing today' }] });
  root.append(stepScreen({
    title: `Ready for ${sessionName}?`,
    lead: 'Two quick taps so today fits how you feel.',
    body: [
      h('div', { class: 'q' }, h('p', {}, 'Energy today'),
        choices({ columns: 3, options: ENERGY_OPTIONS, value: null, label: 'Energy today', onChange: (v) => { a.energy = v; paintScale(); } })),
      scaleBox,
      h('div', { class: 'q' }, h('p', {}, 'Anything to work around today?'), areaChoices),
      h('div', { class: 'card soft' }, h('h2', {}, 'Before you start'), h('ul', {}, PRE_SESSION.map((t) => h('li', {}, t)))),
      msg,
    ],
    actions: [secondary('Back', onBack), primary('Start warm-up', () => {
      if (!a.energy) { msg.textContent = 'Tap your energy level first.'; return; }
      if (!areasPicked) { msg.textContent = 'Tap any areas to work around, or “Nothing today”.'; return; }
      onStart({ ...a, areas: a.areas.filter((x) => x !== 'none') });
    })],
  }));
}
