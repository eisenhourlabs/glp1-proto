// Admin entry. Phase 0: proves admin sign-in + RLS by listing clinics and accounts.
// Clinic management, patients, flags and the AI proposal queue arrive in Phase 4.
import { mountShell, signOutButton } from '../shared/shell.js';
import { db } from '../shared/supa.js';
import { h } from '../shared/dom.js';
import { CONFIG } from '../config.js';

mountShell({
  title: 'Admin',
  allowedRoles: ['admin'],
  async render(profile, root) {
    root.append(h('header', { class: 'app-header' },
      h('div', { class: 'brand' }, `${CONFIG.BRAND_NAME} · Admin`), signOutButton()));

    const [{ data: clinics, error: e1 }, { data: people, error: e2 }] = await Promise.all([
      db.from('clinics').select('id, name, status, is_demo, clinic_codes ( code, active )').order('name'),
      db.from('profiles').select('display_name, role, is_demo, clinics ( name )').order('role'),
    ]);

    root.append(h('section', { class: 'card' }, h('h1', {}, 'Clinics'),
      e1 ? h('p', {}, 'Could not load clinics.') :
      clinics.length === 0 ? h('p', { class: 'muted' }, 'No clinics yet.') :
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Clinic'), h('th', {}, 'Status'), h('th', {}, 'Codes'))),
        h('tbody', {}, clinics.map((c) => h('tr', {},
          h('td', {}, c.name, c.is_demo ? ' (demo)' : ''),
          h('td', {}, c.status),
          h('td', {}, (c.clinic_codes ?? []).filter((k) => k.active).map((k) => k.code).join(', ') || '—')))))));

    root.append(h('section', { class: 'card' }, h('h1', {}, 'Accounts'),
      e2 ? h('p', {}, 'Could not load accounts.') :
      h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Role'), h('th', {}, 'Clinic'))),
        h('tbody', {}, people.map((p) => h('tr', {},
          h('td', {}, p.display_name ?? '—', p.is_demo ? ' (demo)' : ''),
          h('td', {}, p.role),
          h('td', {}, p.clinics?.name ?? '—')))))));
  },
});
