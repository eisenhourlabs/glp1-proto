// Onboarding profile steps: about you, movement check, where you train, work-arounds, schedule, goal.
// Each step saves its answers to her program row before moving on.
import { h } from '../shared/dom.js';
import { stepScreen, choices, primary, secondary, statusLine } from '../shared/ui.js';
import { savePatient, loadContent } from './api.js';

const save = async (ctx, fields, msg) => {
  msg.textContent = 'Saving…';
  try { await savePatient(ctx.profile.id, fields); Object.assign(ctx.ans, fields); msg.textContent = ''; ctx.next(); }
  catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection and try again.'; }
};
const need = (msg, ok, text) => { if (!ok) msg.textContent = text; return ok; };

function aboutYou(ctx) {
  const { ans } = ctx; const msg = statusLine();
  const a = { age_band: ans.age_band ?? null, experience: ans.experience ?? null };
  return stepScreen({
    step: ctx.step, total: ctx.total, title: 'A little about you',
    body: [
      h('h2', {}, 'Your age'),
      choices({ columns: 2, value: a.age_band, onChange: (v) => { a.age_band = v; },
        options: [{ value: '40-49', label: 'Under 50' }, { value: '50-59', label: '50–59' }, { value: '60-69', label: '60–69' }, { value: '70+', label: '70 or older' }] }),
      h('h2', {}, 'Strength training in the last year'),
      choices({ value: a.experience, onChange: (v) => { a.experience = v; }, options: [
        { value: 'none', label: 'None, or not in years', hint: 'That’s most people. We start simple.' },
        { value: 'some', label: 'Some', hint: 'Classes or on and off' },
        { value: 'regular', label: 'Regularly', hint: '2 or more times a week' }] }),
      msg,
    ],
    actions: [secondary('Back', ctx.back), primary('Continue', () =>
      need(msg, a.age_band && a.experience, 'Please choose both.') && save(ctx, a, msg))],
  });
}

function movementCheck(ctx) {
  const msg = statusLine();
  const check = { ...(ctx.ans.workout1_check || {}) };
  const q = (key, text, hint) => h('div', { class: 'q' }, h('p', {}, text), hint ? h('p', { class: 'muted small' }, hint) : null,
    choices({ columns: 3, value: key in check ? (check[key] ? 'yes' : 'no') : null, onChange: (v) => { check[key] = v === 'yes'; },
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }] }));
  return stepScreen({
    step: ctx.step, total: ctx.total, title: 'Quick movement check',
    lead: 'Answer from what you know, or try them now if you like. There’s no wrong answer. This just sets your starting point.',
    body: [
      q('sitToStand', 'Can you stand up from a chair 5 times in a row without using your hands?'),
      q('inclinePushup', 'Can you do 5 push-ups with your hands on a kitchen counter, body straight?'),
      q('hinge', 'Can you bend forward at the hips to touch a chair seat while keeping your back flat?', 'Like closing a car door with your hips.'),
      msg,
    ],
    actions: [secondary('Back', ctx.back), primary('Continue', () => save(ctx, { workout1_check: check }, msg))],
  });
}

async function whereYouTrain(ctx) {
  const { ans } = ctx; const msg = statusLine();
  const content = await loadContent();
  const label = Object.fromEntries(content.equipment.map((e) => [e.code, e.label]));
  const a = { setup: ans.setup ?? null, equipment: [...(ans.equipment || [])], dumbbells_available: [...(ans.dumbbells_available || [])] };
  const equipWrap = h('div', { class: 'stack' });
  const paintEquip = () => {
    equipWrap.replaceChildren();
    if (!a.setup) return;
    const codes = content.equipment.map((e) => e.code).filter((c) => c !== 'none');
    equipWrap.append(h('h2', {}, 'What do you have? Tap to change.'),
      choices({ multi: true, columns: 2, value: a.equipment, onChange: (v) => { a.equipment = v; paintDb(); },
        options: codes.map((c) => ({ value: c, label: label[c] })) }), dbWrap);
    paintDb();
  };
  const dbWrap = h('div', { class: 'stack' });
  const paintDb = () => {
    dbWrap.replaceChildren();
    if (!a.equipment.includes('db') || a.setup === 'commercial_gym') return;
    dbWrap.append(h('h2', {}, 'Which dumbbell weights do you have? (lb)'),
      choices({ multi: true, columns: 4, value: a.dumbbells_available.map(String), onChange: (v) => { a.dumbbells_available = v.map(Number); },
        options: [2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 35, 40].map((w) => ({ value: String(w), label: String(w) })) }));
  };
  const setupOptions = content.setups.map((s) => ({ value: s.setup, label: s.label }));
  const screen = stepScreen({
    step: ctx.step, total: ctx.total, title: 'Where will you train?',
    lead: 'We match every exercise to what you have. You can change this any time, for example if you join a gym.',
    body: [
      choices({ value: a.setup, options: setupOptions, onChange: (v) => {
        a.setup = v; a.equipment = [...content.setups.find((s) => s.setup === v).equipment].filter((c) => c !== 'none'); paintEquip();
      } }),
      equipWrap, msg,
    ],
    actions: [secondary('Back', ctx.back), primary('Continue', () =>
      need(msg, a.setup, 'Please choose where you’ll train.') && save(ctx, a, msg))],
  });
  paintEquip();
  return screen;
}

function workArounds(ctx) {
  const { ans } = ctx; const msg = statusLine();
  const a = { workarounds: [...(ans.workarounds || [])], floor_ok: ans.restrictions?.includes('floor') ? false : Boolean(ans.floor_ok) };
  return stepScreen({
    step: ctx.step, total: ctx.total, title: 'Anything to work around?',
    lead: 'If a spot tends to get achy or tight, tap it. We’ll choose exercises that go easy on it. Tap none if all is well.',
    body: [
      choices({ multi: true, columns: 2, value: a.workarounds, onChange: (v) => { a.workarounds = v; }, options: [
        { value: 'knees', label: 'Knees' }, { value: 'hips', label: 'Hips' }, { value: 'low_back', label: 'Low back' },
        { value: 'upper_back_neck', label: 'Upper back / neck' }, { value: 'shoulders', label: 'Shoulders' },
        { value: 'elbows_wrists', label: 'Elbows / wrists' }] }),
      ans.restrictions?.includes('floor') ? null : h('div', { class: 'q' },
        h('p', {}, 'Are you comfortable getting down to the floor and back up?'),
        choices({ columns: 2, value: a.floor_ok ? 'yes' : 'no', onChange: (v) => { a.floor_ok = v === 'yes'; },
          options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'I’d rather not' }] })),
      msg,
    ],
    actions: [secondary('Back', ctx.back), primary('Continue', () => save(ctx, a, msg))],
  });
}

const DAYS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];

function schedule(ctx) {
  const { ans } = ctx; const msg = statusLine();
  const a = { days_per_week: ans.days_per_week ?? 3, session_minutes: ans.session_minutes ?? 45,
    preferred_days: (ans.preferred_days || []).map(String), low_energy_day: ans.low_energy_day ? String(ans.low_energy_day) : null };
  return stepScreen({
    step: ctx.step, total: ctx.total, title: 'Your week',
    lead: 'Pick what fits your real life. Three short workouts a week is a great place to start.',
    body: [
      h('h2', {}, 'Workouts per week'),
      choices({ columns: 3, value: String(a.days_per_week), onChange: (v) => { a.days_per_week = Number(v); },
        options: [{ value: '2', label: '2' }, { value: '3', label: '3', hint: 'Recommended' }, { value: '4', label: '4', hint: 'If you’re experienced' }] }),
      h('h2', {}, 'Time per workout'),
      choices({ columns: 3, value: String(a.session_minutes), onChange: (v) => { a.session_minutes = Number(v); },
        options: [{ value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: '60', label: '60 min' }] }),
      h('h2', {}, 'Which days usually work?'),
      choices({ multi: true, columns: 4, value: a.preferred_days, onChange: (v) => { a.preferred_days = v; }, options: DAYS.map(([v, l]) => ({ value: v, label: l })) }),
      h('h2', {}, 'Is there a day you usually feel low on energy?'),
      h('p', { class: 'muted small' }, 'We’ll keep that day free.'),
      choices({ columns: 4, value: a.low_energy_day ?? 'none', onChange: (v) => { a.low_energy_day = v === 'none' ? null : v; },
        options: [...DAYS.map(([v, l]) => ({ value: v, label: l })), { value: 'none', label: 'No' }] }),
      msg,
    ],
    actions: [secondary('Back', ctx.back), primary('Continue', () => {
      const days = a.preferred_days.map(Number).filter((d) => String(d) !== a.low_energy_day);
      if (!need(msg, days.length >= a.days_per_week, `Choose at least ${a.days_per_week} days that aren’t your low-energy day.`)) return;
      save(ctx, { days_per_week: a.days_per_week, session_minutes: a.session_minutes, preferred_days: days,
        low_energy_day: a.low_energy_day ? Number(a.low_energy_day) : null }, msg);
    })],
  });
}

function goal(ctx) {
  const { ans } = ctx; const msg = statusLine();
  const a = { goal: ans.goal ?? null, goal_words: ans.goal_words ?? '' };
  const words = h('textarea', { rows: 3, maxlength: 280, placeholder: 'In your own words (optional): what would feel like a win?' });
  words.value = a.goal_words;
  return stepScreen({
    step: ctx.step, total: ctx.total, title: 'What matters most to you?',
    lead: 'We’ll show this back to you along the way.',
    body: [
      choices({ value: a.goal, onChange: (v) => { a.goal = v; }, options: [
        { value: 'keep_muscle', label: 'Keep my muscle while I lose weight' },
        { value: 'everyday_strength', label: 'Make everyday life easier', hint: 'Stairs, groceries, getting up off the floor' },
        { value: 'look_feel', label: 'Feel stronger and more toned' },
        { value: 'habit', label: 'Build a habit I’ll keep' }] }),
      words, msg,
    ],
    actions: [secondary('Back', ctx.back), primary('Continue', () =>
      need(msg, a.goal, 'Please choose one.') && save(ctx, { goal: a.goal, goal_words: words.value.trim() || null }, msg))],
  });
}

export const PROFILE_STEPS = [aboutYou, movementCheck, whereYouTrain, workArounds, schedule, goal];
