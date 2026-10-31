// Clinic entry (view-only). Phase 0: confirms the clinic viewer sees only their own clinic.
// Aggregate dashboard, check-in call list and monthly report arrive in Phase 4 — always via report functions, never tables.
import { mountShell, signOutButton } from '../shared/shell.js';
import { h } from '../shared/dom.js';
import { CONFIG } from '../config.js';

mountShell({
  title: 'Clinic dashboard',
  allowedRoles: ['clinic_viewer'],
  render(profile, root) {
    root.append(
      h('header', { class: 'app-header' },
        h('div', {}, h('div', { class: 'brand' }, profile.clinics?.name ?? 'Your clinic'),
          h('div', { class: 'clinic' }, `${CONFIG.BRAND_NAME} · Clinic view`)),
        signOutButton()),
      h('section', { class: 'card' },
        h('h1', {}, 'Patient program overview'),
        h('p', { class: 'muted' }, 'Enrollment, activity and the check-in call list will appear here.')),
    );
  },
});
