// Patient app entry. Phase 0: signed-in placeholder. The real Home/Week, session logger etc. arrive in Phase 3.
import { mountShell, signOutButton } from '../shared/shell.js';
import { h } from '../shared/dom.js';
import { CONFIG } from '../config.js';

mountShell({
  title: 'Your strength program',
  allowedRoles: ['patient'],
  render(profile, root) {
    const clinic = profile.clinics?.name ?? '';
    root.append(
      h('header', { class: 'app-header' },
        h('div', {}, h('div', { class: 'brand' }, CONFIG.BRAND_NAME), clinic && h('div', { class: 'clinic' }, clinic)),
        signOutButton()),
      h('section', { class: 'card' },
        h('h1', {}, `Welcome${profile.display_name ? ', ' + profile.display_name : ''}`),
        h('p', {}, 'Your program will appear here.'),
        h('p', { class: 'muted' }, 'Prototype build — the workout screens are being built next.')),
      h('p', { class: 'credit' }, 'Strength programming for your clinic’s patients'),
    );
  },
});
