// Patient app entry: route by program status → onboarding, paused (clearance), or home.
import { mountShell, signOutButton } from '../shared/shell.js';
import { h, clear } from '../shared/dom.js';
import { CONFIG, APP_VERSION } from '../config.js';
import { watchForUpdate } from '../shared/update.js';
import { loadPatient, savePatient, activeCycle, loadContent, createFirstCycle } from './api.js';
import { runOnboarding } from './onboarding.js';
import { renderPaused } from './paused.js';
import { renderHome } from './home.js';
import { initOutbox } from './outbox.js';
import { saveCopy } from '../shared/offline.js';
import { syncBadge } from './sync_ui.js';

mountShell({
  title: 'Your strength program',
  allowedRoles: ['patient'],
  async render(profile, root) {
    const header = h('header', { class: 'app-header' },
      h('div', {}, h('div', { class: 'brand' }, CONFIG.BRAND_NAME), profile.clinics?.name ? h('div', { class: 'clinic' }, profile.clinics.name) : null),
      signOutButton());
    const body = h('div', {});
    initOutbox(profile.id).catch((e) => console.warn('outbox', e));   // sends any workout saved while offline (C4)
    root.append(header, syncBadge(), body, h('p', { class: 'credit' }, 'Strength programming for your clinic’s patients', h('span', { class: 'version' }, ` · version ${APP_VERSION}`)));
    watchForUpdate();

    const route = async () => {
      clear(body);
      try {
        const patient = await loadPatient(profile.id);
        if (!patient) {
          body.append(h('section', { class: 'card' }, h('h1', {}, 'Almost there'), h('p', {}, 'Your program isn’t set up yet. Please contact your clinic.')));
          return;
        }
        syncTimezone(profile.id, patient);
        if (patient.status === 'onboarding') return runOnboarding(body, { profile, patient, onDone: route });
        if (patient.status === 'paused' && patient.screening_flag === 'pause') return renderPaused(body, { profile, onDone: route });
        if (patient.status === 'paused' || patient.status === 'inactive') {
          body.append(h('section', { class: 'card' }, h('h1', {}, 'Your program is on hold'),
            h('p', {}, 'The program team has paused your workouts for now. If you have questions, please contact your clinic.')));
          return;
        }
        let cycle = await activeCycle(profile.id);
        if (!cycle) {                                                            // e.g. cleared but cycle not built yet
          cycle = await createFirstCycle(patient, await loadContent());
          saveCopy(`${profile.id}:activeCycle`, cycle);                         // so it opens offline too (C4)
        }
        return renderHome(body, { patient, cycle, reload: route });
      } catch (e) {
        console.error(e);
        body.append(h('section', { class: 'card' }, h('h1', {}, 'Couldn’t load your program'), h('p', {}, 'Check your connection, then reload.')));
      }
    };
    await route();
  },
});

/** Keep patients.timezone in step with her browser (A16). Only once migration 008 has added the column; never blocks. */
function syncTimezone(uid, patient) {
  if (!('timezone' in patient)) return;
  let tz = null;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* old browser */ }
  if (!tz || tz === patient.timezone) return;
  patient.timezone = tz;
  savePatient(uid, { timezone: tz }).catch((e) => console.warn('time zone not saved', e));
}
