// Clinic entry (view-only): the dashboard, the check-in call list and a printable monthly report.
// Everything comes from report functions scoped to the viewer's clinic; clinic logins have no table access.
import { mountShell, signOutButton } from '../shared/shell.js';
import { h, clear } from '../shared/dom.js';
import { CONFIG, APP_VERSION } from '../config.js';
import { updateSlot, watchForUpdate } from '../shared/update.js';
import { renderClinicReport } from './report.js';

mountShell({
  title: 'Clinic dashboard',
  allowedRoles: ['clinic_viewer'],
  async render(profile, root) {
    const body = h('div', {}, h('p', { class: 'muted' }, 'Loading…'));
    root.append(
      h('header', { class: 'app-header no-print' },
        h('div', {}, h('div', { class: 'brand' }, profile.clinics?.name ?? 'Your clinic'),
          h('div', { class: 'clinic' }, `${CONFIG.BRAND_NAME} · Clinic view`)),
        signOutButton()),
      h('div', { class: 'no-print' }, updateSlot()),
      body,
      h('p', { class: 'credit no-print' }, `Version ${APP_VERSION}`));
    watchForUpdate();
    const view = h('div', {});
    try {
      await renderClinicReport(view);
      clear(body).append(view);
    } catch (e) {
      console.error(e);
      clear(body).append(h('section', { class: 'card' }, h('h1', {}, 'Couldn’t load the report'), h('p', {}, 'Check your connection, then reload.')));
    }
  },
});
