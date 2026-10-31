// First sign-in: welcome → consent → screening → waiver → profile steps (onboarding_profile.js) → first cycle.
import { h, clear } from '../shared/dom.js';
import { stepScreen, choices, primary, secondary, signatureField, statusLine } from '../shared/ui.js';
import { CONSENT, CONSENT_VERSION, WAIVER, WAIVER_VERSION, RED_FLAG_QUESTIONS, RESTRICTION_OPTIONS, SCREENING_VERSION } from './copy.js';
import { signDocument, setScreening, savePatient, completeOnboarding, loadPatient, loadContent, createFirstCycle, localToday } from './api.js';
import { PROFILE_STEPS } from './onboarding_profile.js';

const LEGAL_STEPS = [welcome, consent, screening, waiver];

/**
 * Run onboarding inside root. ctx = { profile (login profile), patient (program row), onDone(status) }.
 */
export function runOnboarding(root, ctx) {
  const steps = [...LEGAL_STEPS, ...PROFILE_STEPS, finish];
  const ans = { restrictions: [], workarounds: [], equipment: [], preferred_days: [], ...ctx.patient };
  let i = 0;
  const go = async (delta = 1) => {
    i = Math.max(0, Math.min(steps.length - 1, i + delta));
    clear(root);
    window.scrollTo?.(0, 0);
    root.append(await steps[i]({ ...ctx, ans, step: i + 1, total: steps.length, next: () => go(1), back: () => go(-1) }));
  };
  go(0);
}

function welcome({ profile, step, total, next }) {
  const clinic = profile.clinics?.name;
  return stepScreen({
    step, total,
    title: `Welcome${profile.display_name ? `, ${profile.display_name}` : ''}`,
    lead: `${clinic ? `${clinic} has set you up with` : 'You’re set up with'} a strength program built for you: short workouts that help you keep your muscle, feel stronger and build a habit that lasts.`,
    body: [h('p', {}, 'Setting up takes about 5 minutes. Most answers are a single tap, and you can change them later.')],
    actions: [primary('Let’s start', next)],
  });
}

function consent({ profile, step, total, next, back }) {
  const sig = signatureField();
  const msg = statusLine();
  let agreed = false;
  return stepScreen({
    step, total, title: CONSENT.title, lead: CONSENT.lead,
    body: [
      h('div', { class: 'card soft' }, h('h2', {}, 'Your clinic sees'), h('ul', {}, CONSENT.sees.map((t) => h('li', {}, t)))),
      h('div', { class: 'card soft' }, h('h2', {}, 'Your clinic never sees'), h('ul', {}, CONSENT.neverSees.map((t) => h('li', {}, t)))),
      choices({ options: [{ value: 'yes', label: CONSENT.agree }], multi: true, value: [], onChange: (v) => { agreed = v.includes('yes'); } }),
      sig.el, msg,
    ],
    actions: [secondary('Back', back), primary('Agree and continue', async () => {
      if (!agreed || sig.value().length < 2) { msg.textContent = 'Please tick the box and type your name.'; return; }
      msg.textContent = 'Saving…';
      try { await signDocument(profile.id, { docType: 'consent', version: CONSENT_VERSION, signedName: sig.value() }); next(); }
      catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection and try again.'; }
    })],
  });
}

function screening({ profile, ans, step, total, next, back }) {
  const answers = {};
  const msg = statusLine();
  const sig = signatureField('Type your full name to confirm your answers');
  let restrictYesNo = null;
  const restrictWrap = h('div', { class: 'stack', hidden: true },
    h('p', {}, 'Which of these? Tap all that apply.'),
    choices({ options: RESTRICTION_OPTIONS, multi: true, value: ans.restrictions, onChange: (v) => { ans.restrictions = v; } }));
  const yn = (key, onChange) => choices({ options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }], columns: 2,
    value: null, onChange: (v) => { answers[key] = v === 'yes'; onChange?.(v); } });
  return stepScreen({
    step, total, title: 'A few health questions',
    lead: 'These keep you safe. Your answers stay private: your clinic never sees them.',
    body: [
      ...RED_FLAG_QUESTIONS.map((q) => h('div', { class: 'q' }, h('p', {}, q.text), yn(q.key))),
      h('div', { class: 'q' }, h('p', {}, 'Has a doctor or provider told you to avoid any kind of movement?'),
        yn('restrict', (v) => { restrictYesNo = v; restrictWrap.hidden = v !== 'yes'; if (v !== 'yes') ans.restrictions = []; })),
      restrictWrap, sig.el, msg,
    ],
    actions: [secondary('Back', back), primary('Continue', async () => {
      const unanswered = [...RED_FLAG_QUESTIONS.map((q) => q.key), 'restrict'].filter((k) => !(k in answers));
      if (unanswered.length) { msg.textContent = 'Please answer every question.'; return; }
      if (restrictYesNo === 'yes' && !ans.restrictions.length) { msg.textContent = 'Tap at least one movement to avoid, or answer No.'; return; }
      if (sig.value().length < 2) { msg.textContent = 'Please type your name to confirm.'; return; }
      const redFlag = RED_FLAG_QUESTIONS.some((q) => answers[q.key]);
      msg.textContent = 'Saving…';
      try {
        await signDocument(profile.id, { docType: 'screening', version: SCREENING_VERSION, signedName: sig.value(),
          answers: { ...answers, restrictions: ans.restrictions } });
        await setScreening(redFlag);
        await savePatient(profile.id, { restrictions: ans.restrictions, floor_ok: ans.restrictions.includes('floor') ? false : ans.floor_ok });
        ans.redFlag = redFlag;
        next();
      } catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection and try again.'; }
    })],
  });
}

function waiver({ profile, step, total, next, back }) {
  const sig = signatureField();
  const msg = statusLine();
  let agreed = false;
  return stepScreen({
    step, total, title: WAIVER.title,
    body: [
      h('ul', { class: 'card soft' }, WAIVER.points.map((t) => h('li', {}, t))),
      h('p', { class: 'muted small' }, 'Draft for the prototype. Final wording to be reviewed by an attorney.'),
      choices({ options: [{ value: 'yes', label: WAIVER.agree }], multi: true, value: [], onChange: (v) => { agreed = v.includes('yes'); } }),
      sig.el, msg,
    ],
    actions: [secondary('Back', back), primary('Agree and continue', async () => {
      if (!agreed || sig.value().length < 2) { msg.textContent = 'Please tick the box and type your name.'; return; }
      msg.textContent = 'Saving…';
      try { await signDocument(profile.id, { docType: 'waiver', version: WAIVER_VERSION, signedName: sig.value() }); next(); }
      catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection and try again.'; }
    })],
  });
}

async function finish({ profile, ans, step, total, back, onDone }) {
  const msg = statusLine();
  const run = async () => {
    msg.textContent = 'Building your program…';
    try {
      const status = await completeOnboarding(ans.start_date || localToday());
      if (status === 'active') {
        const patient = await loadPatient(profile.id);
        await createFirstCycle(patient, await loadContent());
      }
      onDone(status);
    } catch (e) { console.error(e); msg.textContent = 'Something went wrong building your program. Please try again.'; }
  };
  return stepScreen({
    step, total, title: 'You’re all set',
    lead: ans.redFlag
      ? 'Thanks. One more thing before your first workout: a quick check with your clinic.'
      : 'Your first workout is a gentle one: we’ll learn the moves and find the right weights together.',
    body: [msg],
    actions: [secondary('Back', back), primary(ans.redFlag ? 'Continue' : 'See my program', run)],
  });
}
