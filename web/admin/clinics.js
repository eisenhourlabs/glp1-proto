// Clinics: create, rename, accent colour, status, and sign-up codes.
import { h, clear } from '../shared/dom.js';
import { primary, secondary, statusLine } from '../shared/ui.js';
import { clinics as loadClinics, createClinic, updateClinic, addCode, setCodeActive } from './api.js';
import { pill } from './patients.js';

const CODE_RE = /^[A-Z0-9-]{4,24}$/;

export async function renderClinics(root) {
  const list = await loadClinics();
  root.replaceChildren();
  const wrap = h('div', {});
  const refresh = () => renderClinics(root);

  // New clinic
  const name = h('input', { type: 'text', maxlength: 120, placeholder: 'Clinic name', 'aria-label': 'Clinic name' });
  const short = h('input', { type: 'text', maxlength: 40, placeholder: 'Short name (optional)', 'aria-label': 'Short name' });
  const accent = h('input', { type: 'color', value: '#2f6f68', 'aria-label': 'Accent colour' });
  const demo = h('input', { type: 'checkbox', id: 'demo-new' });
  const msg = statusLine();
  const form = h('section', { class: 'card' }, h('h2', {}, 'Add a clinic'),
    h('div', { class: 'row filters' }, name, short, accent, h('label', { class: 'row check', for: 'demo-new' }, demo, h('span', {}, 'Demo'))),
    primary('Create clinic', async () => {
      if (name.value.trim().length < 2) { msg.textContent = 'Enter a clinic name.'; return; }
      msg.textContent = 'Saving…';
      try {
        await createClinic({ name: name.value.trim(), short_name: short.value.trim() || null, accent_color: accent.value, is_demo: demo.checked });
        await refresh();
      } catch (e) { console.error(e); msg.textContent = e.message?.includes('duplicate') ? 'That name is taken.' : 'Couldn’t save.'; }
    }), msg);

  for (const c of list) wrap.append(clinicCard(c, refresh));
  root.append(h('h1', {}, 'Clinics'), list.length ? wrap : h('p', { class: 'muted' }, 'No clinics yet.'), form);
}

function clinicCard(c, refresh) {
  const msg = statusLine();
  const accent = h('input', { type: 'color', value: c.accent_color || '#2f6f68', 'aria-label': `Accent colour for ${c.name}` });
  const status = h('select', { 'aria-label': `Status for ${c.name}` }, ['active', 'paused', 'closed'].map((s) => h('option', { value: s, selected: s === c.status }, s)));
  const code = h('input', { type: 'text', maxlength: 24, placeholder: 'NEWCODE', 'aria-label': `New code for ${c.name}`, style: 'text-transform:uppercase' });
  const codes = h('ul', { class: 'list' });
  const paintCodes = () => {
    clear(codes).append(...(c.clinic_codes || []).map((k) => h('li', { class: 'row between' },
      h('span', {}, h('code', {}, k.code), ' ', pill(k.active ? 'active' : 'off', k.active ? 'active' : '')),
      secondary(k.active ? 'Turn off' : 'Turn on', async () => {
        try { await setCodeActive(k.code, !k.active); k.active = !k.active; paintCodes(); }
        catch (e) { console.error(e); msg.textContent = 'Couldn’t change the code.'; }
      }))));
    if (!c.clinic_codes?.length) codes.append(h('li', { class: 'muted' }, 'No sign-up codes yet.'));
  };
  paintCodes();
  return h('section', { class: 'card' },
    h('div', { class: 'row between' },
      h('h2', {}, h('span', { class: 'swatch', style: `background:${c.accent_color || '#2f6f68'}` }), c.name, c.is_demo ? ' (demo)' : ''),
      pill(c.status, c.status === 'active' ? 'active' : 'warn')),
    h('div', { class: 'row filters' },
      h('label', { class: 'row' }, h('span', {}, 'Accent'), accent),
      h('label', { class: 'row' }, h('span', {}, 'Status'), status),
      secondary('Save', async () => {
        msg.textContent = 'Saving…';
        try { await updateClinic(c.id, { accent_color: accent.value, status: status.value }); msg.textContent = 'Saved.'; }
        catch (e) { console.error(e); msg.textContent = 'Couldn’t save.'; }
      })),
    h('h3', {}, 'Sign-up codes'),
    codes,
    h('div', { class: 'row filters' }, code, secondary('Add code', async () => {
      const v = code.value.trim().toUpperCase();
      if (!CODE_RE.test(v)) { msg.textContent = 'Codes are 4–24 letters, numbers or dashes.'; return; }
      try { await addCode({ code: v, clinic_id: c.id }); await refresh(); }
      catch (e) { console.error(e); msg.textContent = e.message?.includes('duplicate') ? 'That code is already used.' : 'Couldn’t add the code.'; }
    })),
    msg);
}
