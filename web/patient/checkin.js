// After a workout: a 3-tap check-in (Framework §10, §12), the bounded adjustments and flags it triggers, then the
// reward screen with her streak and this week's count.
import { h, clear } from '../shared/dom.js';
import { stepScreen, choices, primary, secondary, statusLine } from '../shared/ui.js';
import { addDays } from '../engine/util.js';
import { checkinActions } from '../engine/checkin.js';
import { weeklyCounts, streaks, rewardMessage } from '../engine/progress.js';
import { localToday } from './api.js';
import { saveCheckin, cycleLogs, flagsSince, cycleAdjustments, addAdjustment, raiseFlag } from './log_api.js';
import { AREA_OPTIONS } from './session_copy.js';

const FEEL = [
  { value: 'too_easy', label: 'Too easy' }, { value: 'right', label: 'About right' }, { value: 'too_hard', label: 'Too hard' },
];
const SORE = [{ value: 'none', label: 'None' }, { value: 'some', label: 'Some' }, { value: 'a_lot', label: 'A lot' }];

/** ctx: { patient, cycle, log, week, perWeek, settings, onDone({ messages }) } */
export function renderCheckin(root, ctx) {
  const a = { feel: null, soreness: null, sore_areas: [], note: '' };
  const msg = statusLine();
  const areaBox = h('div', {});
  const paintAreas = () => {
    clear(areaBox);
    if (a.soreness === 'some' || a.soreness === 'a_lot') {
      areaBox.append(h('div', { class: 'q' }, h('p', {}, 'Where?'),
        choices({ multi: true, columns: 2, options: AREA_OPTIONS, value: a.sore_areas, label: 'Where are you sore?', onChange: (v) => { a.sore_areas = v; } })));
    } else a.sore_areas = [];
  };
  const note = h('textarea', { rows: 2, maxlength: 500, 'aria-label': 'Anything you want us to know?' });
  note.addEventListener('input', () => { a.note = note.value; });

  root.append(stepScreen({
    title: 'Quick check-in',
    lead: 'Three taps help us get your next workouts right.',
    body: [
      h('div', { class: 'q' }, h('p', {}, 'How did today feel?'),
        choices({ columns: 3, options: FEEL, value: null, label: 'How did today feel?', onChange: (v) => { a.feel = v; } })),
      h('div', { class: 'q' }, h('p', {}, 'Any muscle soreness right now?'),
        choices({ columns: 3, options: SORE, value: null, label: 'Soreness', onChange: (v) => { a.soreness = v; paintAreas(); } })),
      areaBox,
      h('div', { class: 'q' }, h('p', {}, 'Anything you want us to know? (optional)'), note),
      msg,
    ],
    actions: [
      secondary('Skip', () => ctx.onDone({ messages: [] })),
      primary('Save', async () => {
        if (!a.feel || !a.soreness) { msg.textContent = 'Tap how it felt and your soreness.'; return; }
        msg.textContent = 'Saving…';
        try {
          await saveCheckin(ctx.log.id, { feel: a.feel, soreness: a.soreness, sore_areas: a.sore_areas, note: a.note.trim() || null });
          const messages = await afterCheckin(ctx).catch((e) => { console.error(e); return []; });
          ctx.onDone({ messages });
        } catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection and try again.'; }
      }),
    ],
  }));
}

/** Apply what the check-in triggers. Returns the messages to show her. */
async function afterCheckin({ patient, cycle, log, week, perWeek, settings }) {
  const today = localToday();
  const [logs, flags, adjustments] = await Promise.all([
    cycleLogs(cycle.id), flagsSince(patient.id, addDays(today, -15)), cycleAdjustments(cycle.id)]);
  const r = checkinActions({ logs, flags, adjustments, cycle, week, perWeek, today, lastLogId: log.id, settings });
  for (const adj of r.adjustments) await addAdjustment(patient.id, cycle.id, adj);
  for (const f of r.flags) await raiseFlag(patient.id, f.type, f.detail);
  return r.messages;
}

/** ctx: { patient, cycle, week, perWeek, status, messages, onHome, onProgress } */
export async function renderReward(root, ctx) {
  const logs = await cycleLogs(ctx.cycle.id);
  const weeks = weeklyCounts(logs, ctx.week, ctx.perWeek);
  const s = streaks(weeks, ctx.week);
  const thisWeek = weeks[weeks.length - 1];
  root.append(h('section', { class: 'step center reward' },
    h('div', { class: 'badge', 'aria-hidden': 'true' }, '✓'),
    h('h1', {}, ctx.status === 'partial' ? 'Saved. Every part counts!' : 'Workout done!'),
    h('p', { class: 'lead' }, rewardMessage(s.total)),
    h('div', { class: 'stats' },
      stat(`${thisWeek?.done ?? 0} of ${ctx.perWeek}`, 'this week'),
      stat(String(s.current), 'streak'),
      stat(String(s.total), s.total === 1 ? 'workout total' : 'workouts total')),
    h('p', { class: 'small muted' }, 'Your streak only breaks if you miss two planned workouts in a row.'),
    ...ctx.messages.map((m) => h('p', { class: 'card soft' }, m)),
    h('div', { class: 'actions' }, secondary('See progress', ctx.onProgress), primary('Back to home', ctx.onHome))));
}

const stat = (big, small) => h('div', { class: 'stat' }, h('span', { class: 'stat-big' }, big), h('span', { class: 'stat-small' }, small));
