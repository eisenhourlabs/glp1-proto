// Home: this week's queue (Framework §13) with the next workout one tap away, the week-4/9 message (§7.2a),
// comeback framing, and the workout flow: readiness → warm-up → exercises → check-in → reward.
import { h, clear } from '../shared/dom.js';
import { primary, secondary, choices } from '../shared/ui.js';
import { weekOfCycle, weekModeMessage } from '../engine/cycle.js';
import { comebackMode } from '../engine/adherence.js';
import { sessionOrder, weekStatus, trainedOn, weekWindow, weekModeFor } from '../engine/session.js';
import { swapNote } from '../engine/resolve.js';
import { activeAdjustments } from '../engine/checkin.js';
import { loadContent, localToday } from './api.js';
import { loadSettings, loadWarmups, cycleLogs, lastWorkoutDate, flagsSince, startSession, sessionExerciseLogs, finishSession,
  discardSession, saveWeekMode, updateCycleStart, cycleAdjustments, skipToday, cycleProposal } from './log_api.js';
import { makePlanner, warmupFor, renderReadiness } from './today.js';
import { runWorkout } from './workout.js';
import { COMEBACK } from './session_copy.js';
import { renderCheckin, renderReward } from './checkin.js';
import { renderProgress } from './progress.js';
import { installCard } from './extras.js';
import { openSheet } from './workout_parts.js';
import { SKIP_OPTIONS } from './session_copy.js';
import { renderReview } from './review.js';
import { addDays } from '../engine/util.js';

const GOALS = {
  keep_muscle: 'Keep my muscle while I lose weight', everyday_strength: 'Make everyday life easier',
  look_feel: 'Feel stronger and more toned', habit: 'Build a habit I’ll keep',
};
const DONE = new Set(['done', 'partial']);

export async function renderHome(root, { patient, cycle, reload }) {
  const [content, settings] = await Promise.all([loadContent(), loadSettings()]);
  const today = localToday();
  let logs = await cycleLogs(cycle.id);
  logs = await tidyStale(logs, today);
  const template = content.templates.find((t) => t.template_id === cycle.template_id);
  const lib = Object.fromEntries(content.library.map((e) => [e.id, e]));
  const rawWeek = weekOfCycle(cycle.start_date, today);
  const week = Math.min(Math.max(rawWeek, 1), 9);
  const order = sessionOrder(template);
  const names = Object.fromEntries(template.sessions.map((s) => [s.session, s.name]));
  const status = weekStatus(order, logs.filter((l) => l.week === week));

  let decision = { mode: 'build' };
  if (rawWeek >= 1) {
    const flagCount = week === 4 || week === 9 ? (await flagsSince(patient.id, weekWindow(cycle.start_date, week - 2).from)).length : 0;
    decision = weekModeFor({ week, cycle, logs, daysPerWeek: template.days_per_week, flagCount, settings });
    if (!decision.stored) await saveWeekMode(cycle, week, decision).catch(console.error);
  }
  const active = activeAdjustments({ adjustments: await cycleAdjustments(cycle.id), logs, week });
  const lighterByCheckin = active.lighterWeek && decision.mode === 'build';
  const weekMode = lighterByCheckin ? 'lighter' : decision.mode;
  const comeback = comebackMode(await lastWorkoutDate(patient.id), today, settings);
  const inProgress = logs.find((l) => l.status === 'in_progress' && l.log_date === today);
  const lastDone = [...logs].reverse().find((l) => DONE.has(l.status));
  const env = { patient, cycle, content, settings, week, weekMode, comeback, holdAndTrim: active.holdAndTrim };
  const rerender = async () => { clear(root); await renderHome(root, { patient, cycle, reload }); window.scrollTo?.(0, 0); };

  // ── Cycle review (week 9 on, Framework §14) ──
  const reviewOpen = rawWeek >= 9;
  const proposal = reviewOpen ? await cycleProposal(cycle.id).catch(() => null) : null;
  const showReview = () => {
    clear(root);
    renderReview(root, { patient, cycle, template, content, canStart: rawWeek >= 10 || status.complete,
      startsOn: prettyDate(addDays(cycle.start_date, 63)), onDone: () => (reload ? reload() : rerender()) }).catch(fail);
    window.scrollTo?.(0, 0);
  };

  // ── Workout flow ──
  const begin = (session) => {
    clear(root);
    renderReadiness(root, { sessionName: names[session], onBack: rerender, onStart: (answers) => start(session, answers).catch(fail) });
  };
  const start = async (session, answers) => {
    const todayAns = { ...answers, soreAreas: lastDone?.sore_areas || [] };
    const planner = makePlanner(env, todayAns);
    const items = await planner.build(session);
    const log = await startSession(patient.id, { cycleId: cycle.id, week, session, day: today, energy: answers.energy,
      workaroundAreas: answers.areas, scaled: answers.scale });
    await workout(session, log, planner, todayAns, items, []);
  };
  const resume = async (log) => {
    const todayAns = { energy: log.energy, areas: log.workaround_areas || [], scale: log.scaled, easier: false, soreAreas: lastDone?.sore_areas || [] };
    const planner = makePlanner({ ...env, excludeSession: log.id }, todayAns);
    const [items, existing] = await Promise.all([planner.build(log.session), sessionExerciseLogs(log.id)]);
    await workout(log.session, log, planner, todayAns, items, existing);
  };
  const workout = async (session, log, planner, todayAns, items, existing) => {
    clear(root);
    const warmup = warmupFor(await loadWarmups(content.version), patient);
    runWorkout(root, { patient, cycle, sessionLog: log, sessionName: names[session], items, warmup, existing, planner, today: todayAns,
      onFinish: (r) => finishScreen({ ...r, log }, session) });
  };
  const finishScreen = (r, session) => {
    clear(root);
    if (r.ended) return rerender();
    renderCheckin(root, { patient, cycle, log: r.log, week, perWeek: template.days_per_week, settings, onDone: ({ messages }) => {
      clear(root);
      renderReward(root, { patient, cycle, week, perWeek: template.days_per_week, status: r.status, messages, onHome: rerender, onProgress: showProgress })
        .catch(fail);
      window.scrollTo?.(0, 0);
    } });
    window.scrollTo?.(0, 0);
  };
  const skipSheet = () => {
    let reason = null; let close = () => {};
    const msg = h('p', { class: 'form-msg', role: 'status' });
    close = openSheet('Can’t train today?', [
      h('p', {}, 'No problem. What’s getting in the way? It helps your clinic support you.'),
      choices({ columns: 2, options: SKIP_OPTIONS, value: null, label: 'Reason', onChange: (v) => { reason = v; } }),
      msg,
      primary('Save', async () => {
        if (!reason) { msg.textContent = 'Tap a reason.'; return; }
        try { await skipToday(patient.id, { cycleId: cycle.id, week, session: status.next, day: today, reason }); close(); rerender(); }
        catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection.'; }
      }),
    ]);
  };
  const showProgress = () => {
    clear(root);
    renderProgress(root, { patient, cycle, template, week, library: content.library, onBack: rerender }).catch(fail);
    window.scrollTo?.(0, 0);
  };

  // ── Home screen ──
  const hero = h('section', { class: 'card hero' },
    h('p', { class: 'eyebrow' }, `${template.name} · Week ${week} of 9`),
    h('h1', {}, rawWeek < 1 ? 'Your program' : 'This week'),
    patient.goal ? h('p', { class: 'goal' }, `Your goal: ${GOALS[patient.goal] ?? patient.goal}`, patient.goal_words ? ` · “${patient.goal_words}”` : '') : null);
  const notes = [];
  if (rawWeek < 1) notes.push(h('p', {}, `Your program starts on ${prettyDate(cycle.start_date)}. Want to start today instead?`),
    secondary('Start today', async () => { await updateCycleStart(cycle, today); rerender(); }));
  if (reviewOpen) {
    notes.push(h('p', {}, proposal ? `Your Cycle ${cycle.cycle_no + 1} plan is ready. Start it when you’re ready.`
      : rawWeek > 9 ? 'You’ve finished this cycle! Do your 2-minute review to plan the next one.'
        : 'Week 9: time for your cycle review. It takes about 2 minutes.'));
    if (rawWeek === 9) notes.push(secondary(proposal ? 'See your next cycle' : 'Your cycle review', showReview));
  }
  const modeMsg = lighterByCheckin ? 'This week is lighter so you can recharge. It still counts fully.' : weekModeMessage(decision.mode);
  if (modeMsg) notes.push(h('p', {}, modeMsg));
  if (comeback.mode !== 'none') notes.push(h('p', {}, COMEBACK[comeback.mode]));
  if (notes.length) hero.append(h('div', { class: 'card soft' }, ...notes));

  let action;
  if (rawWeek < 1) action = null;
  else if (inProgress) action = primary(`Continue ${names[inProgress.session]}`, () => resume(inProgress).catch(fail));
  else if (rawWeek >= 10) action = primary(proposal ? `Start Cycle ${cycle.cycle_no + 1}` : 'Do your cycle review', showReview);
  else if (trainedOn(logs, today)) action = h('p', { class: 'center muted' }, 'Done for today. Rest up, and the next one is ready when you are.');
  else if (status.complete) action = h('p', { class: 'center' }, 'All of this week’s workouts are done. Great week!');
  else {
    const skipped = logs.some((l) => l.log_date === today && l.status === 'skipped');
    action = h('div', { class: 'stack' }, primary(`Start ${names[status.next]}`, () => begin(status.next)),
      skipped ? h('p', { class: 'center small muted' }, 'Got it. Your next workout is here whenever you’re ready.')
        : h('button', { type: 'button', class: 'btn btn-link center-self', onclick: () => skipSheet() }, 'Can’t train today?'));
  }

  const queue = h('section', { class: 'card' }, h('h2', {}, 'This week’s workouts'),
    h('ol', { class: 'queue' }, order.map((s) => {
      const done = status.done.includes(s);
      const isNext = !done && s === status.next;
      const items = cycle.items.filter((i) => i.session === s && i.exercise_id).sort((a, b) => a.ord - b.ord);
      return h('li', { class: `queue-item${done ? ' done' : ''}${isNext ? ' next' : ''}` },
        h('details', {}, h('summary', {},
          h('span', { class: 'queue-mark', 'aria-hidden': 'true' }, done ? '✓' : isNext ? '›' : ''),
          h('span', { class: 'exname' }, names[s]),
          h('span', { class: 'small muted' }, done ? ' · done' : isNext ? ' · next' : '')),
        h('ul', { class: 'exlist' }, items.map((i) => {
          const note = swapNote(i.reasons || []);
          return h('li', {}, lib[i.exercise_id]?.name ?? i.exercise_id, note ? h('span', { class: 'note' }, note) : null);
        }))));
    })),
    h('p', { class: 'small muted' }, 'Do them in any days that suit you. Anything not done by the end of the week simply drops off.'));

  root.append(hero, action ? h('div', { class: 'home-action' }, action) : null, queue,
    h('div', { class: 'home-action' }, secondary('Your progress', showProgress)), installCard());

  function fail(e) { console.error(e); clear(root).append(h('section', { class: 'card' }, h('h1', {}, 'Something didn’t load'), h('p', {}, 'Check your connection, then reload.'))); }
}

/** Workouts left open on an earlier day: keep what she did (partial) or remove an empty one. */
async function tidyStale(logs, today) {
  const stale = logs.filter((l) => l.status === 'in_progress' && l.log_date < today);
  for (const l of stale) {
    try {
      const ex = await sessionExerciseLogs(l.id);
      if (ex.some((e) => e.sets?.length)) { await finishSession(l.id, 'partial'); l.status = 'partial'; }
      else { await discardSession(l.id); l.status = 'gone'; }
    } catch (e) { console.error(e); }
  }
  return logs.filter((l) => l.status !== 'gone');
}

const prettyDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
