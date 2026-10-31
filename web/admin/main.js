// Admin: patients, flags, clinics, settings. Hash routes so the browser back button works:
//   #patients  #patient/<id>  #flags  #clinics  #settings
import { mountShell, signOutButton } from '../shared/shell.js';
import { h, clear } from '../shared/dom.js';
import { CONFIG } from '../config.js';
import { renderPatients } from './patients.js';
import { renderPatient } from './patient.js';
import { renderFlags } from './flags.js';
import { renderClinics } from './clinics.js';
import { renderSettings } from './settings.js';

const TABS = [['patients', 'Patients'], ['flags', 'Flags'], ['clinics', 'Clinics'], ['settings', 'Settings']];

mountShell({
  title: 'Admin',
  allowedRoles: ['admin'],
  async render(profile, root) {
    const nav = h('nav', { class: 'tabs', 'aria-label': 'Admin sections' });
    const body = h('div', {});
    root.append(h('header', { class: 'app-header' }, h('div', { class: 'brand' }, `${CONFIG.BRAND_NAME} · Admin`), signOutButton()), nav, body);

    const route = async () => {
      const [name, arg] = (location.hash.replace(/^#/, '') || 'patients').split('/');
      clear(nav).append(...TABS.map(([k, label]) => h('a', { href: `#${k}`, class: 'tab', 'aria-current': (k === name || (k === 'patients' && name === 'patient')) ? 'page' : null }, label)));
      clear(body).append(h('p', { class: 'muted' }, 'Loading…'));
      const view = h('div', {});
      try {
        if (name === 'patient' && arg) await renderPatient(view, { id: arg, admin: profile });
        else if (name === 'flags') await renderFlags(view, { admin: profile });
        else if (name === 'clinics') await renderClinics(view);
        else if (name === 'settings') await renderSettings(view);
        else await renderPatients(view);
        clear(body).append(view);
      } catch (e) {
        console.error(e);
        clear(body).append(h('section', { class: 'card' }, h('h1', {}, 'Couldn’t load this page'), h('p', {}, 'Check your connection, then reload.')));
      }
    };
    window.addEventListener('hashchange', route);
    await route();
  },
});
