// End-of-cycle reflection choices (Framework §14) and the filter that keeps only them (backlog E4).
// The patient app shows these; the ai-cycle-review function accepts nothing else, so nothing she types reaches the AI.
// Values are stable keys; labels are what she sees.

export const WORKED = [['short_workouts', 'Short workouts'], ['getting_stronger', 'Feeling stronger'], ['schedule', 'My schedule'],
  ['energy', 'More energy'], ['checkins', 'The check-ins'], ['guidance', 'Knowing what to do']];
export const IN_THE_WAY = [['busy', 'Busy weeks'], ['low_energy', 'Low energy'], ['soreness', 'Soreness'], ['travel', 'Travel'],
  ['motivation', 'Motivation'], ['nothing', 'Nothing really']];
export const ADJUST = [['same', 'Keep it the same'], ['more', 'A bit more challenge'], ['easier', 'A bit easier'],
  ['shorter', 'Shorter workouts'], ['fewer_days', 'Fewer days'], ['more_days', 'More days']];
/** Focus choices: the value is the text itself (it is shown back to her and to the coach as is). */
export const FOCUS = ['Stronger legs for stairs and getting up', 'Upper-body strength for carrying and lifting', 'Steadier balance',
  'Showing up every week', 'Everyday tasks feel easier'];

const keys = (list) => new Set(list.map(([k]) => k));
const WORKED_K = keys(WORKED); const IN_THE_WAY_K = keys(IN_THE_WAY); const ADJUST_K = keys(ADJUST); const FOCUS_K = new Set(FOCUS);
const pick = (a, allowed) => (Array.isArray(a) ? [...new Set(a.filter((x) => allowed.has(x)))] : []);

/**
 * Her reflection reduced to the fixed choices. Anything else (free text, unknown keys, other fields) is dropped.
 * → { worked: [], in_the_way: [], adjust: key|null, focus: choice|null, days: 2|3|4|null, minutes: 30|45|60|null }
 */
export function choicesOnly(r = {}) {
  const days = Number(r?.days); const minutes = Number(r?.minutes);
  return {
    worked: pick(r?.worked, WORKED_K), in_the_way: pick(r?.in_the_way, IN_THE_WAY_K),
    adjust: ADJUST_K.has(r?.adjust) ? r.adjust : null,
    focus: FOCUS_K.has(typeof r?.focus === 'string' ? r.focus.trim() : null) ? r.focus.trim() : null,
    days: [2, 3, 4].includes(days) ? days : null,
    minutes: [30, 45, 60].includes(minutes) ? minutes : null,
  };
}
