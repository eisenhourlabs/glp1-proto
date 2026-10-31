// Progress and rewards (Framework §13, §15): planned-vs-done by week, the forgiving streak, strength wins and
// milestone messages. Strength only: never weight, BMI or body shape (S10).

import { forgivingStreak, bestStreak } from './adherence.js';
import { workingSets, weightLabel } from './session.js';

const DONE = new Set(['done', 'partial']);

/**
 * Week-by-week view of a cycle: [{ week, planned, done }] for weeks 1..currentWeek.
 * A week still in progress counts only what's done so far (planned stays the week's total).
 */
export function weeklyCounts(logs, currentWeek, perWeek) {
  const out = [];
  for (let w = 1; w <= Math.min(currentWeek, 9); w++) {
    const done = new Set(logs.filter((l) => l.week === w && DONE.has(l.status)).map((l) => l.session)).size;
    out.push({ week: w, planned: perWeek, done: Math.min(done, perWeek) });
  }
  return out;
}

/**
 * Planned sessions in order for the streak: done ones first within each week, and misses only once a week has ended.
 * @returns {Array<{done: boolean}>}
 */
export function plannedSessions(weeks, currentWeek) {
  const out = [];
  for (const w of weeks) {
    for (let i = 0; i < w.done; i++) out.push({ done: true });
    if (w.week < currentWeek) for (let i = w.done; i < w.planned; i++) out.push({ done: false });
  }
  return out;
}

export function streaks(weeks, currentWeek) {
  const s = plannedSessions(weeks, currentWeek);
  return { current: forgivingStreak(s), best: bestStreak(s), total: s.filter((x) => x.done).length };
}

/**
 * Strength wins: for each exercise she's logged at least twice, first vs latest working weight (or reps / seconds
 * for bodyweight). Only real improvements are listed, biggest first.
 * exerciseLogs: [{ exercise_id, sets, skipped, created_at }]
 */
export function strengthWins(exerciseLogs, library, limit = 6) {
  const lib = Object.fromEntries(library.map((e) => [e.id, e]));
  const by = new Map();
  for (const l of [...exerciseLogs].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    if (l.skipped || !l.sets?.length || !lib[l.exercise_id]) continue;
    (by.get(l.exercise_id) ?? by.set(l.exercise_id, []).get(l.exercise_id)).push(l);
  }
  const wins = [];
  for (const [id, logs] of by) {
    if (logs.length < 2) continue;
    const ex = lib[id];
    const measure = ex.measure === 'time' ? 'time' : 'reps';
    const a = workingSets(logs[0].sets, measure);
    const b = workingSets(logs[logs.length - 1].sets, measure);
    const best = (ws) => Math.max(...ws.sets.map((s) => s.reps));
    const unit = measure === 'time' ? ' s' : ' reps';
    if (ex.load_type !== 'bodyweight' && a.weight != null && b.weight > a.weight) {
      wins.push({ id, name: ex.name, from: weightLabel(ex.load_type, a.weight), to: weightLabel(ex.load_type, b.weight), gain: (b.weight - a.weight) / a.weight });
    } else if ((ex.load_type === 'bodyweight' || b.weight === a.weight) && best(b) > best(a)) {
      wins.push({ id, name: ex.name, from: `${best(a)}${unit}`, to: `${best(b)}${unit}`, gain: (best(b) - best(a)) / Math.max(1, best(a)) / 2 });
    }
  }
  return wins.sort((x, y) => y.gain - x.gain).slice(0, limit);
}

const MILESTONES = {
  1: 'First workout done. That’s the hardest one.',
  3: 'Three workouts in. You’re building the habit.',
  5: 'Five workouts! Your muscles are already adapting.',
  10: 'Ten workouts. You’re becoming someone who trains.',
  25: 'Twenty-five workouts. That’s real consistency.',
  50: 'Fifty workouts. Strong and consistent.',
};
const EVERYDAY = [
  'Nice work. Every workout helps you keep your muscle.',
  'Done and counted. Showing up is the win.',
  'Another one in the bank. Stronger every week.',
  'That’s how strength gets built: one workout at a time.',
];

/** The reward line after workout number `total`. */
export const rewardMessage = (total) => MILESTONES[total] ?? EVERYDAY[total % EVERYDAY.length];
