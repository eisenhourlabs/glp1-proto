// Home: this week's queue (Framework §13) with the next workout one tap away, the week-4/9 message (§7.2a),
// comeback framing, and the workout flow: readiness → warm-up → exercises → check-in → reward.
import { h, clear } from '../shared/dom.js';
import { primary, secondary, choices } from '../shared/ui.js';
import { weekOfCycle, weekModeMessage } from '../engine/cycle.js';
import { restartDue } from '../engine/adherence.js';
import { standingAreas } from '../engine/readiness.js';
import { weeklyCounts, streaks } from '../engine/progress.js';
import { sessionOrder, weekStatus, trainedOn, weekWindow, weekModeFor } from '../engine/session.js';
import { swapNote } from '../engine/resolve.js';
import { activeAdjustments, extraSetsAllowed } from '../engine/checkin.js';
import { loadContent, localToday, restartCycle } from './api.js';
import { loadSettings, loadWarmups, cycleLogs, recentWorkouts, standingInputs, addAdjustment, flagsSince, startSession, sessionExerciseLogs, finishSession,
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
import { homeState, comebackFor, restDaySuggested } from '../engine/home_state.js';
import { findOffer, offerCard } from './offers_ui.js';
import { selfLighterState, selfLighterRange } from '../engine/lighter.js';

const GOALS = {
  keep_muscle: 'Keep my muscle', everyday_strength: 'Make everyday life easier',
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
  const adjustments = await cycleAdjustments(cycle.id);
  cycle.restart = adjustments.find((a) => a.type === 'comeback_restart')?.detail ?? null;
  const active = activeAdjustments({ adjustments, logs, week });
  const lighterByCheckin = active.lighterWeek && decision.mode === 'build';
  // Her own "Rough week?" switch (B9): the lighter dose for 7 days.
  const self = selfLighterState({ adjustments, today, weekMode: lighterByCheckin ? 'lighter' : decision.mode, settings });
  const weekMode = lighterByCheckin || self.active ? 'lighter' : decision.mode;
  const [recent, standingIn] = await Promise.all([recentWorkouts(patient.id), standingInputs(patient.id)]);
  const last = recent[0] ?? null;
  const comeback = comebackFor(recent, cycle, today, settings);
  const standing = standingAreas(standingIn.pain, standingIn.clears);
  const inProgress = logs.find((l) => l.status === 'in_progress' && l.log_date === today);
  const lastDone = [...logs].reverse().find((l) => DONE.has(l.status));
  const env = { patient, cycle, content, settings, week, weekMode, comeback, standing, capNo: cycle.restart?.cap_no ?? cycle.cycle_no,
    holdAndTrim: active.holdAndTrim,
    extraSets: active.extraSets && !active.holdAndTrim && extraSetsAllowed(weekMode) };
  const rerender = async () => { clear(root); await renderHome(root, { patient, cycle, reload }); window.scrollTo?.(0, 0); };

  // ── Cycle review (week 9 on, Framework §14) ──
  const reviewOpen = rawWeek >= 9;
  const proposal = reviewOpen ? await cycleProposal(cycle.id).catch(() => null) : null;

  // ── Back after 28+ days inside the cycle (§13, B7): restart this cycle type at week 1 ──
  const doneWeeks = logs.filter((l) => DONE.has(l.status)).map((l) => l.week);
  if (restartDue({ mode: comeback.mode, rawWeek, lastWeekInCycle: doneWeeks.length ? Math.max(...doneWeeks) : null, proposalReady: Boolean(proposal) })) {
    const best = streaks(weeklyCounts(logs, week, template.days_per_week), week).best;
    await restartCycle(patient, cycle, { bestStreak: Math.max(best, cycle.restart?.best_streak ?? 0), fromWeek: week });
    return reload ? reload() : window.location.reload();
  }
  const showReview = () => {
    clear(root);
    renderReview(root, { patient, cycle, template, content, canStart: rawWeek >= 10 || status.complete,
      startsOn: prettyDate(addDays(cycle.start_date, 63)), onDone: () => (reload ? reload() : rerender()) }).catch(fail);
    window.scrollTo?.(0, 0);
  };

  // ── Workout flow ──
  const begin = (session) => {
    clear(root);
    renderReadiness(root, { sessionName: names[session], onBack: rerender, onStart: (answers) => start(session, answers).catch(fail),
      standing: [...env.standing], onBetter: async (area) => {
        await addAdjustment(patient.id, cycle.id, { type: 'workaround_cleared', reason: 'feeling_better', detail: { area } });
        env.standing = env.standing.filter((a) => a !== area);
      } });
  };
  const start = async (session, answers) => {
    const todayAns = { ...answers, soreAreas: lastDone?.sore_areas || [] };
    const planner = makePlanner(env, todayAns);
    const items = await planner.build(session);
    const log = await startSession(patient.id, { cycleId: cycle.id, week, session, day: today, energy: answers.energy,
      workaroundAreas: answers.areas, scaled: answers.scale });
    if (answers.short) await addAdjustment(patient.id, cycle.id, { type: 'short_version', reason: 'patient_choice', detail: { session_log_id: log.id } });
    await workout(session, log, planner, todayAns, items, []);
  };
  const resume = async (log) => {
    const todayAns = { energy: log.energy, areas: log.workaround_areas || [], scale: log.scaled, easier: false, soreAreas: lastDone?.sore_areas || [],
      short: adjustments.some((a) => a.type === 'short_version' && a.detail?.session_log_id === log.id) };
    const planner = makePlanner({ ...env, excludeSession: log.id }, todayAns);
    const [items, existing] = await Promise.all([planner.build(log.session), sessionExerciseLogs(log.id)]);
    await workout(log.session, log, planner, todayAns, items, existing);
  };
  const workout = async (session, log, planner, todayAns, items, existing) => {
    clear(root);
    const warmup = warmupFor(await loadWarmups(content.version), patient);
    runWorkout(root, { patient, cycle, sessionLog: log, sessionName: names[session], items, warmup, existing, planner, today: todayAns,
      onFinish: (r) => finishScreen({ ...r, log, slots: planner.cycleSlots }, session) });
  };
  const finishScreen = (r, session) => {
    clear(root);
    if (r.ended) return rerender();
    renderCheckin(root, { patient, cycle, log: r.log, week, perWeek: template.days_per_week, settings, onDone: async ({ messages }) => {
      // In-cycle level-up offer (B6): only from week 4, never on a day she worked around pain.
      const offer = r.states ? await findOffer(env, r.states, r.slots).catch((e) => { console.error(e); return null; }) : null;
      clear(root);
      renderReward(root, { patient, cycle, week, perWeek: template.days_per_week, status: r.status, messages, onHome: rerender, onProgress: showProgress,
        offerCard: offer ? offerCard(offer, { patient, cycle }) : null, carriedBest: cycle.restart?.best_streak ?? 0 })
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
  const roughWeekSheet = () => {
    let close = () => {};
    const msg = h('p', { class: 'form-msg', role: 'status' });
    close = openSheet('Rough week?', [
      h('p', {}, 'Switch to the lighter version for the next 7 days: the same exercises with fewer sets and easier effort. It still counts fully.'),
      h('p', { class: 'small muted' }, `You can do this ${self.max === 1 ? 'once' : `${self.max} times`} a cycle${self.used ? ` (${self.used} used)` : ''}.`),
      msg,
      h('div', { class: 'stack' }, primary('Switch for 7 days', async () => {
        try {
          await addAdjustment(patient.id, cycle.id, { type: 'self_lighter_week', reason: 'patient_choice', detail: { ...selfLighterRange(today, settings), week } });
          close(); rerender();
        } catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection.'; }
      }), secondary('Not now', () => close())),
    ]);
  };
  const roughWeek = () => {
    if (self.canStart) return h('button', { type: 'button', class: 'btn btn-link center-self', 'data-rough-week': '', onclick: () => roughWeekSheet() }, 'Rough week? Switch to the lighter version for 7 days');
    if (self.usedUp && weekMode === 'build') return h('p', { class: 'center small muted', 'data-rough-week': 'used' }, 'Rough week? You’ve used your lighter weeks this cycle. It’s worth a quick word with your clinic.');
    return null;
  };
  const showProgress = () => {
    clear(root);
    renderProgress(root, { patient, cycle, template, week, library: content.library, carriedBest: cycle.restart?.best_streak ?? 0, onBack: rerender }).catch(fail);
    window.scrollTo?.(0, 0);
  };

  // ── Home screen: one notice at most (B11) ──
  const state = homeState({ rawWeek, weekComplete: status.complete, proposalReady: Boolean(proposal), comeback: comeback.mode,
    weekMode: decision.mode, lighterByCheckin: lighterByCheckin || self.active, restDay: restDaySuggested(patient.age_band, last?.date, today) });
  const hero = h('section', { class: 'card hero' },
    h('p', { class: 'eyebrow' }, `${template.name} · ${state.label}`),
    h('h1', {}, rawWeek < 1 ? 'Your program' : state.complete ? 'Cycle complete' : 'This week'),
    patient.goal ? h('p', { class: 'goal' }, `Your goal: ${GOALS[patient.goal] ?? patient.goal}`, patient.goal_words ? ` · “${patient.goal_words}”` : '') : null);
  const notes = noticeContent(state, {
    startsOn: prettyDate(cycle.start_date), nextNo: cycle.cycle_no + 1, rawWeek, comeback: comeback.second ? 'reentry_second' : comeback.mode,
    weekMode: decision.mode, lighterByCheckin, selfUntil: self.active ? prettyDate(self.until) : null,
    startToday: async () => { await updateCycleStart(cycle, today); rerender(); }, showReview,
  });
  if (notes.length) hero.append(h('div', { class: 'card soft', 'data-notice': state.notice }, ...notes));

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
        : h('button', { type: 'button', class: 'btn btn-link center-self', onclick: () => skipSheet() }, 'Can’t train today?'), roughWeek());
  }

  const ended = rawWeek > 9;   // the cycle is over: show week 9 as it finished, with nothing marked "next"
  const queue = h('section', { class: 'card' }, h('h2', {}, ended ? 'Week 9 workouts' : 'This week’s workouts'),
    h('ol', { class: 'queue' }, order.map((s) => {
      const done = status.done.includes(s);
      const isNext = !ended && !done && s === status.next;
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
    ended ? null : h('p', { class: 'small muted' }, 'Do them in any days that suit you. Anything not done by the end of the week simply drops off.'));

  root.append(hero, action ? h('div', { class: 'home-action' }, action) : null, queue,
    h('div', { class: 'home-action' }, secondary('Your progress', showProgress)), installCard());

  function fail(e) { console.error(e); clear(root).append(h('section', { class: 'card' }, h('h1', {}, 'Something didn’t load'), h('p', {}, 'Check your connection, then reload.'))); }
}

/** The content of the single home notice for a homeState() result. */
function noticeContent(state, { startsOn, nextNo, rawWeek, comeback, weekMode, lighterByCheckin, selfUntil, startToday, showReview }) {
  switch (state.notice) {
    case 'upcoming': return [h('p', {}, `Your program starts on ${startsOn}. Want to start today instead?`), secondary('Start today', startToday)];
    case 'next_ready': return [h('p', {}, `Your Cycle ${nextNo} plan is ready. Start it when you’re ready.`),
      rawWeek === 9 ? secondary('See your next cycle', showReview) : null];
    case 'review_due': return [h('p', {}, state.complete ? 'You’ve finished this cycle! Do your 2-minute review to plan the next one.'
      : 'Week 9: time for your cycle review. It takes about 2 minutes.'), rawWeek === 9 ? secondary('Your cycle review', showReview) : null];
    case 'comeback': return [h('p', {}, COMEBACK[comeback])];
    case 'week_mode': return [h('p', {}, selfUntil ? `Your lighter week runs through ${selfUntil}. Fewer sets, easier effort, and it still counts fully.`
      : lighterByCheckin && weekMode === 'build'
      ? 'This week is lighter so you can recharge. It still counts fully.' : weekModeMessage(weekMode))];
    case 'rest_day': return [h('p', {}, 'You trained yesterday. A rest day in between helps your muscles get stronger, so today is a good day off. Your next workout is here whenever you’re ready.')];
    default: return [];
  }
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
