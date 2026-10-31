// Settings (the Framework's ⚙ values: adjustment bounds, thresholds) and content versions (read-only).
import { h } from '../shared/dom.js';
import { secondary } from '../shared/ui.js';
import { settings as loadSettings, saveSetting, contentVersions } from './api.js';
import { pill } from './patients.js';

const num = (v) => (typeof v === 'object' && v !== null && 'value' in v ? v.value : v);

export async function renderSettings(root) {
  const [rows, versions] = await Promise.all([loadSettings(), contentVersions()]);
  const tbody = h('tbody', {}, rows.map((r) => {
    const input = h('input', { type: 'number', step: 'any', value: num(r.value), 'aria-label': r.key, class: 'num' });
    const msg = h('span', { class: 'small muted', role: 'status' });
    return h('tr', {},
      h('td', {}, h('code', {}, r.key)),
      h('td', {}, input),
      h('td', { class: 'small muted' }, r.note ?? ''),
      h('td', {}, secondary('Save', async () => {
        const v = Number(input.value);
        if (input.value === '' || Number.isNaN(v)) { msg.textContent = 'Enter a number.'; return; }
        try { await saveSetting(r.key, v); msg.textContent = 'Saved'; } catch (e) { console.error(e); msg.textContent = 'Couldn’t save'; }
      }), msg));
  }));
  root.append(
    h('section', { class: 'card' },
      h('h1', {}, 'Settings'),
      h('p', { class: 'small muted' }, 'Bounds and thresholds the engine uses. Changes apply the next time a patient opens the app. Re-importing content keeps these unless you use --reset-settings.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, ...['Setting', 'Value', 'What it does', ''].map((t) => h('th', {}, t)))), tbody))),
    h('section', { class: 'card' },
      h('h2', {}, 'Content versions'),
      h('p', { class: 'small muted' }, 'Imported from the master workbook with scripts/import_content.py. A patient’s cycle keeps the version it started on.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', {}, h('tr', {}, ...['Version', 'Imported', 'File', 'Contents', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, versions.map((v) => h('tr', {},
          h('td', {}, String(v.version)),
          h('td', {}, new Date(v.imported_at).toLocaleString()),
          h('td', {}, v.source_file, v.note ? h('div', { class: 'small muted' }, v.note) : null),
          h('td', { class: 'small' }, Object.entries(v.summary || {}).map(([k, n]) => `${k} ${n}`).join(' · ')),
          h('td', {}, v.is_current ? pill('current', 'active') : null))))))));
}
