// Safe app updates (backlog C5). A new version installs in the background and waits (see sw.js). The home screen
// shows "Update ready" through updateSlot(); tapping it hands over to the new version and reloads. Nothing here runs
// during a workout: the slot is only placed on the home screen, and only her tap applies an update.
import { h, clear } from './dom.js';

let waitingReg = null;
const slots = new Set();

function render(el) {
  clear(el);
  if (!waitingReg) return;
  el.append(h('section', { class: 'card soft update-ready', role: 'status' },
    h('p', {}, 'A new version of the app is ready.'),
    h('button', { type: 'button', class: 'btn btn-quiet', onclick: applyUpdate }, 'Update now')));
}

/** A placeholder for the home screen; filled with the "Update ready" card when a new version is waiting. */
export function updateSlot() {
  const el = h('div', { 'data-update-slot': '' });
  for (const s of slots) if (!s.isConnected) slots.delete(s);
  slots.add(el);
  render(el);
  return el;
}

function ready(reg) {
  if (!reg.waiting || !navigator.serviceWorker.controller) return;   // first install: nothing to replace
  waitingReg = reg;
  for (const s of slots) if (s.isConnected) render(s);
}

/** Start watching for a waiting version (call once per page load). */
export async function watchForUpdate() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (!reg) return;
  // A version may be waiting already, still installing (the browser re-checks on every load), or arrive later.
  const track = (sw) => sw?.addEventListener('statechange', () => { if (sw.state === 'installed') ready(reg); });
  ready(reg);
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));
}

export function applyUpdate() {
  if (!waitingReg?.waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waitingReg.waiting.postMessage({ type: 'SKIP_WAITING' });
}
