// Patient app entry: route by program status → onboarding, paused (clearance), or home.
import { mountShell, signOutButton } from '../shared/shell.js';
import { h, clear } from '../shared/dom.js';
import { CONFIG } from '../config.js';
import { loadPatient, activeCycle, loadContent, createFirstCycle } from './api.js';
import { runOnboarding } from './onboarding.js';
import { renderPaused } from './paused.js';
import { renderHome } from './home.js';

mountShell({
  title: 'Your strength program',
  allowedRoles: ['patient'],
  async render(profile, root) {
    const header = h('header', { class: 'app-header' },
      h('div', {}, h('div', { class: 'brand' }, CONFIG.BRAND_NAME), profile.clinics?.name ? h('div', { class: 'clinic' }, profile.clinics.name) : null),
      signOutButton());
    const body = h('div', {});
    root.append(header, body, h('p', { class: 'credit' }, 'Strength programming for your clinic’s patients'));

    const route = async () => {
      clear(body);
      try {
        const patient = await loadPatient(profile.id);
        if (!patient) {
          body.append(h('section', { class: 'card' }, h('h1', {}, 'Almost there'), h('p', {}, 'Your program isn’t set up yet. Please contact your clinic.')));
          return;
        }
        if (patient.status === 'onboarding') return runOnboarding(body, { profile, patient, onDone: route });
        if (patient.status === 'paused') return renderPaused(body, { profile, onDone: route });
        let cycle = await activeCycle(profile.id);
        if (!cycle) cycle = await createFirstCycle(patient, await loadContent());   // e.g. cleared but cycle not built yet
        return renderHome(body, { patient, cycle });
      } catch (e) {
        console.error(e);
        body.append(h('section', { class: 'card' }, h('h1', {}, 'Couldn’t load your program'), h('p', {}, 'Check your connection, then reload.')));
      }
    };
    await route();
  },
});
