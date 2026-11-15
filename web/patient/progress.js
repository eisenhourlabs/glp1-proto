// Progress: workouts by week, the forgiving streak, and strength wins. Strength only: no body weight anywhere (S10).
import { h } from '../shared/dom.js';
import { primary } from '../shared/ui.js';
import { weeklyCounts, streaks, strengthWins } from '../engine/progress.js';
import { weekStreaks } from '../engine/week_streak.js';
import { cycleLogs, allExerciseLogs, loadSettings } from './log_api.js';
import { reminderCard } from './extras.js';
import { WEEKLY_STREAK_NOTE } from './session_copy.js';
import { benchmarkProgressSection } from './benchmarks_ui.js';

/** ctx: { patient, cycle, template, week, library, carriedBest (best streak before a restart), onBack } */
export async function renderProgress(root, ctx) {
  const [logs, exLogs] = await Promise.all([cycleLogs(ctx.cycle.id), allExerciseLogs(ctx.patient.id)]);
  const perWeek = ctx.template.days_per_week;
  const weeks = weeklyCounts(logs, ctx.week, perWeek);
  const total = streaks(weeks, ctx.week).total;
  const s = weekStreaks(weeks, ctx.week);
  s.best = Math.max(s.best, ctx.carriedBest ?? 0);   // a restart after time away (B7) keeps her best streak
  const wins = strengthWins(exLogs, ctx.library);
  const tests = await benchmarkProgressSection({ patient: ctx.patient, settings: await loadSettings() }).catch((e) => { console.error(e); return null; });

  root.append(
    h('section', { class: 'card hero' },
      h('p', { class: 'eyebrow' }, `${ctx.template.name} · Week ${ctx.week} of 9`),
      h('h1', {}, 'Your progress'),
      h('div', { class: 'stats' },
        stat(String(total), total === 1 ? 'workout' : 'workouts'),
        stat(String(s.current), 'weekly streak'),
        stat(String(s.best), 'best weekly streak'))),
    h('section', { class: 'card' },
      h('h2', {}, 'Workouts by week'),
      h('ol', { class: 'weeks', 'aria-label': 'Workouts done each week' }, weeks.map((w) => h('li', { class: 'week-row' },
        h('span', { class: 'week-n' }, `Week ${w.week}`),
        h('span', { class: 'week-val' },
          h('span', { class: 'dots', 'aria-hidden': 'true' },
            Array.from({ length: w.planned }, (_, i) => h('span', { class: `dot${i < w.done ? ' on' : ''}` }))),
          h('span', { class: 'week-text' }, `${w.done} of ${w.planned}`))))),
      h('p', { class: 'small muted' }, WEEKLY_STREAK_NOTE)),
    h('section', { class: 'card' },
      h('h2', {}, 'Getting stronger'),
      wins.length
        ? h('ul', { class: 'wins' }, wins.map((w) => h('li', {}, h('span', { class: 'exname' }, w.name), h('span', { class: 'win' }, `${w.from} → ${w.to}`))))
        : h('p', { class: 'muted' }, 'After a couple of weeks, the exercises where you’ve moved up will show here.')),
    tests,
    reminderCard(ctx.patient),
    h('div', { class: 'actions static' }, primary('Back to home', ctx.onBack)),
  );
}

const stat = (big, small) => h('div', { class: 'stat' }, h('span', { class: 'stat-big' }, big), h('span', { class: 'stat-small' }, small));
