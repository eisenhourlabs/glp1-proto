// End-of-cycle review (Framework §14), about 2 minutes: celebrate → reflect → focus and schedule → the coach's plan
// for the next cycle → start it. The plan comes from the ai-cycle-review function; if that can't be reached, she gets
// the standard plan computed here, so she's never blocked.
import { h, clear } from '../shared/dom.js';
import { stepScreen, choices, primary, secondary, statusLine } from '../shared/ui.js';
import { weeklyCounts, streaks, strengthWins } from '../engine/progress.js';
import { cycleSummary, defaultProposal, proposalLines, CYCLE_NAMES } from '../engine/review.js';
import { createNextCycle } from './api.js';
import { cycleLogs, allExerciseLogs, myFlags, cycleAdjustments, cycleProposal, runReview } from './log_api.js';

const WORKED = [['short_workouts', 'Short workouts'], ['getting_stronger', 'Feeling stronger'], ['schedule', 'My schedule'],
  ['energy', 'More energy'], ['checkins', 'The check-ins'], ['guidance', 'Knowing what to do']];
const IN_THE_WAY = [['busy', 'Busy weeks'], ['low_energy', 'Low energy'], ['soreness', 'Soreness'], ['travel', 'Travel'],
  ['motivation', 'Motivation'], ['nothing', 'Nothing really']];
const ADJUST = [['same', 'Keep it the same'], ['more', 'A bit more challenge'], ['easier', 'A bit easier'],
  ['shorter', 'Shorter workouts'], ['fewer_days', 'Fewer days'], ['more_days', 'More days']];
const FOCUS = ['Stronger legs for stairs and getting up', 'Upper-body strength for carrying and lifting', 'Steadier balance',
  'Showing up every week', 'Everyday tasks feel easier'];
const opts = (list) => list.map(([value, label]) => ({ value, label }));

/** ctx: { patient, cycle, template, content, canStart, startsOn, onDone() } */
export async function renderReview(root, ctx) {
  const existing = await cycleProposal(ctx.cycle.id);
  if (existing) return planScreen(root, ctx, existing);
  const [logs, exLogs] = await Promise.all([cycleLogs(ctx.cycle.id), allExerciseLogs(ctx.patient.id)]);
  const a = { worked: [], in_the_way: [], adjust: null, focus: null, days: ctx.patient.days_per_week ?? 3,
    minutes: ctx.patient.session_minutes ?? ctx.cycle.session_minutes ?? 45, note: '' };
  const steps = [celebrate, reflect, plan];
  let i = 0;
  const go = (d = 1) => { i += d; clear(root); window.scrollTo?.(0, 0); root.append(steps[i]()); };
  const total = steps.length;

  function celebrate() {
    const weeks = weeklyCounts(logs, 9, ctx.template.days_per_week);
    const s = streaks(weeks, 10);
    const wins = strengthWins(exLogs, ctx.content.library, 3);
    return stepScreen({
      step: 1, total, title: `Your Cycle ${ctx.cycle.cycle_no} review`,
      lead: `Look at what you’ve done in ${CYCLE_NAMES[ctx.cycle.cycle_type]}.`,
      body: [
        h('div', { class: 'stats' }, stat(s.total, 'workouts'), stat(s.best, 'best streak'), stat(weeks.filter((w) => w.done).length, 'weeks trained')),
        wins.length ? h('div', { class: 'card' }, h('h2', {}, 'Getting stronger'),
          h('ul', { class: 'wins' }, wins.map((w) => h('li', {}, h('span', {}, w.name), h('span', { class: 'win' }, `${w.from} → ${w.to}`))))) : null,
        h('p', {}, 'Two quick questions, then your coach plans your next cycle.'),
      ],
      actions: [primary('Let’s plan the next one', () => go(1))],
    });
  }

  function reflect() {
    return stepScreen({
      step: 2, total, title: 'Looking back',
      body: [
        h('div', { class: 'q' }, h('p', {}, 'What worked for you? (any)'),
          choices({ multi: true, columns: 2, options: opts(WORKED), value: a.worked, label: 'What worked', onChange: (v) => { a.worked = v; } })),
        h('div', { class: 'q' }, h('p', {}, 'What got in the way? (any)'),
          choices({ multi: true, columns: 2, options: opts(IN_THE_WAY), value: a.in_the_way, label: 'What got in the way', onChange: (v) => { a.in_the_way = v; } })),
        h('div', { class: 'q' }, h('p', {}, 'One change for next time?'),
          choices({ columns: 2, options: opts(ADJUST), value: a.adjust, label: 'One change', onChange: (v) => { a.adjust = v; } })),
      ],
      actions: [secondary('Back', () => go(-1)), primary('Continue', () => go(1))],
    });
  }

  function plan() {
    const msg = statusLine();
    const note = h('textarea', { rows: 2, maxlength: 500, 'aria-label': 'Anything else for the program team' });
    note.addEventListener('input', () => { a.note = note.value; });
    return stepScreen({
      step: 3, total, title: 'Your next cycle',
      body: [
        h('div', { class: 'q' }, h('p', {}, 'Pick a focus'),
          choices({ options: FOCUS.map((f) => ({ value: f, label: f })), value: a.focus, label: 'Focus', onChange: (v) => { a.focus = v; } })),
        h('div', { class: 'q' }, h('p', {}, 'Days a week'),
          choices({ columns: 3, options: ['2', '3', '4'].map((d) => ({ value: d, label: d })), value: String(a.days), label: 'Days a week', onChange: (v) => { a.days = Number(v); } })),
        h('div', { class: 'q' }, h('p', {}, 'Workout length'),
          choices({ columns: 3, options: ['30', '45', '60'].map((m) => ({ value: m, label: `${m} min` })), value: String(a.minutes), label: 'Workout length', onChange: (v) => { a.minutes = Number(v); } })),
        h('div', { class: 'q' }, h('p', {}, 'Anything else the program team should know? (optional)'), note),
        msg,
      ],
      actions: [secondary('Back', () => go(-1)), primary('Plan my next cycle', async (e) => {
        if (!a.focus) { msg.textContent = 'Pick a focus first.'; return; }
        e.target.disabled = true;
        msg.textContent = 'Your coach is looking over your cycle…';
        let proposal;
        try { proposal = await runReview(a); }
        catch (err) {
          console.warn('cycle review unavailable, using the standard plan', err);
          if (err.code === 'too_early') { msg.textContent = 'Your review opens in week 9.'; e.target.disabled = false; return; }
          proposal = await localDefault(ctx, a, logs, exLogs);          // never blocked: the standard plan
        }
        clear(root); window.scrollTo?.(0, 0);
        planScreen(root, ctx, proposal);
      })],
    });
  }
  root.append(steps[0]());
}

async function localDefault(ctx, reflection, logs, exLogs) {
  const [flags, adjustments] = await Promise.all([myFlags(ctx.patient.id).catch(() => []), cycleAdjustments(ctx.cycle.id).catch(() => [])]);
  const summary = cycleSummary({ patient: ctx.patient, cycle: ctx.cycle, template: ctx.template, logs, exerciseLogs: exLogs,
    flags, adjustments, library: ctx.content.library, reflection });
  return { id: null, status: 'ready', source: 'default', final: defaultProposal(summary), reflection };
}

/** The coach's notes and the plan; confirm days and length; start the next cycle. */
function planScreen(root, ctx, proposal) {
  const p = proposal.final;
  const next = ctx.cycle.cycle_no + 1;
  const choice = { days: p.days_per_week ?? ctx.patient.days_per_week ?? 3,
    minutes: proposal.reflection?.minutes ?? ctx.patient.session_minutes ?? 45 };
  const msg = statusLine();
  const lines = proposalLines(p, ctx.content.library);
  const dayOpts = (p.cycle_type === 'C1' ? ['2', '3'] : ['2', '3', '4']).map((d) => ({ value: d, label: d }));
  root.append(stepScreen({
    title: `Cycle ${next}: ${CYCLE_NAMES[p.cycle_type]}`,
    lead: proposal.source === 'ai' ? 'Your coach’s notes' : 'Your plan',
    body: [
      h('div', { class: 'card soft' }, h('p', {}, p.recap)),
      h('p', {}, h('strong', {}, 'Focus: '), p.focus),
      lines.length ? h('div', { class: 'card' }, h('h2', {}, 'What changes'), h('ul', { class: 'exlist' }, lines.map((l) => h('li', {}, l)))) : null,
      proposal.status === 'pending' ? h('p', { class: 'small muted' }, 'Your coach is double-checking a couple of details. If it’s not ready when you start, you’ll begin with the standard plan, and nothing is lost.') : null,
      h('div', { class: 'q' }, h('p', {}, 'Days a week'),
        choices({ columns: 3, options: dayOpts, value: String(Math.min(choice.days, p.cycle_type === 'C1' ? 3 : 4)), label: 'Days a week', onChange: (v) => { choice.days = Number(v); } })),
      h('div', { class: 'q' }, h('p', {}, 'Workout length'),
        choices({ columns: 3, options: ['30', '45', '60'].map((m) => ({ value: m, label: `${m} min` })), value: String(choice.minutes), label: 'Workout length', onChange: (v) => { choice.minutes = Number(v); } })),
      ctx.canStart ? null : h('p', { class: 'small muted' }, `You can start once this week’s workouts are done, or from ${ctx.startsOn}.`),
      msg,
    ],
    actions: [secondary('Back to home', ctx.onDone), ctx.canStart ? primary(`Start Cycle ${next}`, async (e) => {
      e.target.disabled = true;
      msg.textContent = 'Building your next cycle…';
      try {
        await createNextCycle(ctx.patient, ctx.cycle, p, ctx.content, { days: choice.days, minutes: choice.minutes, proposalId: proposal.id });
        ctx.onDone();
      } catch (err) { console.error(err); msg.textContent = 'Couldn’t start it. Check your connection and try again.'; e.target.disabled = false; }
    }) : null],
  }));
}

const stat = (big, small) => h('div', { class: 'stat' }, h('span', { class: 'stat-big' }, String(big)), h('span', { class: 'stat-small' }, small));
