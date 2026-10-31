// Paused after a screening red flag: she checks with her clinic, then confirms clearance herself (signed).
import { h } from '../shared/dom.js';
import { stepScreen, choices, primary, signatureField, statusLine } from '../shared/ui.js';
import { CLEARANCE, CLEARANCE_VERSION } from './copy.js';
import { selfClear, loadPatient, loadContent, createFirstCycle } from './api.js';

export function renderPaused(root, { profile, onDone }) {
  const sig = signatureField();
  const msg = statusLine();
  let agreed = false;
  root.append(stepScreen({
    title: CLEARANCE.title, lead: CLEARANCE.lead,
    body: [
      h('div', { class: 'card soft' }, h('p', {}, 'Your clinic can help: call them and say you’re starting the strength program and want to make sure it’s right for you.')),
      choices({ options: [{ value: 'yes', label: CLEARANCE.agree }], multi: true, value: [], onChange: (v) => { agreed = v.includes('yes'); } }),
      sig.el, msg,
    ],
    actions: [primary('I’m cleared, let’s start', async () => {
      if (!agreed || sig.value().length < 2) { msg.textContent = 'Please tick the box and type your name.'; return; }
      msg.textContent = 'Building your program…';
      try {
        const status = await selfClear(sig.value(), CLEARANCE_VERSION);
        if (status === 'active') await createFirstCycle(await loadPatient(profile.id), await loadContent());
        onDone(status);
      } catch (e) { console.error(e); msg.textContent = 'Something went wrong. Please try again.'; }
    })],
  }));
}
