// Home-screen install guide and calendar reminders.
import { h } from '../shared/dom.js';
import { primary, secondary, statusLine } from '../shared/ui.js';
import { CONFIG } from '../config.js';
import { buildIcs, defaultDays } from '../shared/ics.js';
import { savePatient, localToday } from './api.js';

const storageKey = (k) => `${CONFIG.STORAGE_PREFIX}-${k}`;
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const dismissed = () => { try { return localStorage.getItem(storageKey('install-dismissed')) === '1'; } catch { return false; } };

/** "Put it on your home screen" card, or null when installed or dismissed. */
export function installCard() {
  if (standalone() || dismissed()) return null;
  const card = h('section', { class: 'card soft install' });
  const close = () => { try { localStorage.setItem(storageKey('install-dismissed'), '1'); } catch { /* private mode: just hide it */ } card.remove(); };
  const how = isIos()
    ? [h('p', {}, 'In Safari, tap the Share button (the square with an arrow), then “Add to Home Screen”.')]
    : deferredPrompt
      ? [primary('Add to home screen', async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => null); deferredPrompt = null; card.remove(); })]
      : [h('p', {}, 'In Chrome, tap the ⋮ menu, then “Add to Home screen” or “Install app”.')];
  card.append(
    h('h2', {}, 'Put your program on your home screen'),
    h('p', { class: 'small muted' }, 'It opens like an app, one tap from your workouts.'),
    ...how,
    secondary('Not now', close));
  return card;
}

const pretty = (t) => {
  const [hh, mm] = t.split(':').map(Number);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};

/** Calendar reminders on her workout days at a time she picks. */
export function reminderCard(patient) {
  const days = patient.preferred_days?.length ? patient.preferred_days.map(Number) : defaultDays(patient.days_per_week);
  const time = h('input', { type: 'time', value: (patient.reminder_time || '17:30').slice(0, 5), 'aria-label': 'Reminder time' });
  const msg = statusLine();
  const summary = h('p', { class: 'small muted' });
  const paint = () => { summary.textContent = `${days.map((d) => DAY_NAMES[d]).join(', ')} at ${pretty(time.value || '17:30')}`; };
  time.addEventListener('input', paint);
  paint();
  return h('section', { class: 'card' },
    h('h2', {}, 'Workout reminders'),
    h('p', {}, 'Add a reminder to your phone’s calendar for your workout days.'),
    h('label', { class: 'stack' }, h('span', {}, 'Remind me at'), time),
    summary,
    primary('Add to my calendar', async () => {
      const t = time.value || '17:30';
      savePatient(patient.id, { reminder_time: t }).catch(console.error);
      patient.reminder_time = t;
      const ics = buildIcs({
        days, time: t, startDate: localToday(), minutes: patient.session_minutes || 30,
        title: 'Strength workout', url: new URL('./', location.href).href,
        uid: `${patient.id}-reminders@${location.hostname}`, stamp: new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      });
      const a = h('a', { href: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`, download: 'workout-reminders.ics' });
      document.body.append(a); a.click(); a.remove();
      msg.textContent = 'Open the file and tap “Add” to put the reminders in your calendar.';
    }),
    msg);
}
