// Staff kit for a sign-up code: printable wallet cards (4 per page) and a poster, each with a QR code to the join link.
import { h } from '../shared/dom.js';
import { primary } from '../shared/ui.js';
import { APP_ROOT } from '../shared/supa.js';
import { CONFIG } from '../config.js';
import { joinLink, normalizeCode } from '../shared/enroll_rules.js';
import { clinics as loadClinics } from './api.js';

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.mjs';
const SVG = 'http://www.w3.org/2000/svg';

/** A QR code as an SVG element (drawn from the module grid; no markup strings). */
async function qrSvg(text, size) {
  const { default: qrcode } = await import(QR_LIB);
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + quiet * 2} ${n + quiet * 2}`);
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `QR code for ${text}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(SVG, 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
  svg.append(bg);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#000');
  svg.append(path);
  return svg;
}

export async function renderKit(root, { code }) {
  const c = normalizeCode(code);
  const all = await loadClinics();
  const clinic = all.find((x) => (x.clinic_codes || []).some((k) => k.code === c));
  if (!clinic) { root.append(h('p', {}, 'No clinic has that code.')); return; }
  const url = joinLink(APP_ROOT, c);
  const accent = clinic.accent_color || '#2f6f68';

  const card = async () => h('div', { class: 'kit-card', style: `--kit-accent:${accent}` },
    h('div', { class: 'kit-text' },
      h('p', { class: 'kit-clinic' }, clinic.name),
      h('p', { class: 'kit-title' }, 'Your strength program'),
      h('p', { class: 'kit-small' }, 'Short, guided workouts for home or gym. Scan to join, or visit the link and enter your code.'),
      h('p', { class: 'kit-code' }, 'Code: ', h('strong', {}, c)),
      h('p', { class: 'kit-small kit-url' }, url.replace(/^https?:\/\//, ''))),
    await qrSvg(url, 112));

  const cards = await Promise.all([card(), card(), card(), card()]);
  const poster = h('section', { class: 'kit-poster', style: `--kit-accent:${accent}` },
    h('p', { class: 'kit-clinic' }, `${clinic.name} · ${CONFIG.BRAND_NAME}`),
    h('h1', {}, 'Stronger, one short workout at a time'),
    h('ul', {},
      h('li', {}, 'A strength program built around you: your schedule, your equipment, your pace'),
      h('li', {}, 'Guided workouts with suggested weights, for home or the gym'),
      h('li', {}, 'Helps you keep your strength while you lose weight')),
    await qrSvg(url, 260),
    h('p', { class: 'kit-big-code' }, 'Scan to join · code ', h('strong', {}, c)),
    h('p', { class: 'kit-small' }, url));

  root.append(
    h('div', { class: 'no-print' },
      h('p', {}, h('a', { href: '#clinics' }, '← Clinics')),
      h('section', { class: 'card' },
        h('h1', {}, `Staff kit · ${c}`),
        h('p', {}, 'Print the cards (4 per page, cut along the lines) and the poster for the front desk. Patients scan the code or type it at the join page.'),
        h('p', { class: 'small' }, 'Join link: ', h('code', {}, url)),
        h('div', { class: 'row' },
          primary('Print cards', () => printOnly('cards')),
          primary('Print poster', () => printOnly('poster'))))),
    h('div', { class: 'kit-sheet', 'data-kit': 'cards' }, ...cards),
    h('div', { class: 'kit-sheet', 'data-kit': 'poster' }, poster));
}

function printOnly(which) {
  document.body.dataset.print = which;
  window.print();
  setTimeout(() => { delete document.body.dataset.print; }, 500);
}
