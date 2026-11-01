// Validating an AI cycle proposal (Framework §14 "may / may not", S-rules, admin bounds), plus the tool schema and
// prompt the AI is called with. A proposal with errors is never applied as-is; one with review items is valid but
// outside the auto-apply bounds. Either way it goes to the admin queue and she gets the default until it's decided.

import { PATTERNS } from './util.js';
import { contextFor, eligible } from './resolve.js';
import { NEXT_CYCLE, CYCLE_NAMES, PATTERN_NAMES, applyLevelChanges } from './review.js';

export const DEFAULTS = { 'ai.max_exercise_swaps': 3, 'ai.repeat_cycle_below_adherence_pct': 50, 'ai.recap_max_words': 120 };
const cfg = (s, k) => (s && s[k] != null ? Number(s[k]) : DEFAULTS[k]);

/** Words the recap and focus must never use (§14 "may not", S10, §15 tone). Exercise loads like "15 lb" are fine. */
export const BANNED = /\b(weight[- ]?loss|lose weight|losing weight|lost \d+|pounds? (?:lost|down|off)|bmi|body mass|calorie|diet|nutrition|protein shake|medication|meds|dose|ozempic|wegovy|semaglutide|tirzepatide|mounjaro|zepbound|glp-?1|injur\w*|diagnos\w*|skinny|slim(?:mer)?|tone[ds]?|toning|belly|thighs?|burn|fat|beginner|advanced|failed|missed)\b/i;

const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/** Coerce the AI's tool input into a proposal shape (or null if it isn't one). */
export function normalizeProposal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const arr = (x) => (Array.isArray(x) ? x : []);
  return {
    cycle_type: String(raw.cycle_type ?? '').toUpperCase(),
    days_per_week: Number(raw.days_per_week),
    level_changes: arr(raw.level_changes).map((c) => ({ pattern: String(c?.pattern ?? '').toUpperCase(), change: Number(c?.change), evidence: String(c?.evidence ?? '').slice(0, 200) })),
    swaps: arr(raw.swaps).map((s) => ({ pattern: String(s?.pattern ?? '').toUpperCase(), exercise_id: String(s?.exercise_id ?? '').toUpperCase(), reason: String(s?.reason ?? '').slice(0, 200) })),
    recap: String(raw.recap ?? '').trim(),
    focus: String(raw.focus ?? '').trim(),
    flags: arr(raw.flags).map((f) => ({ reason: String(f?.reason ?? f ?? '').slice(0, 300) })).filter((f) => f.reason),
  };
}

/**
 * @param {object} p      normalized proposal
 * @param {object} ctx    { summary, library, profile (engine shape), settings }
 * @returns {{ errors: string[], review: string[] }}
 */
export function validateProposal(p, { summary, library, profile, settings }) {
  const errors = [];
  const review = [];
  if (!p) return { errors: ['not a proposal'], review };
  const cur = summary.cycle.type;
  const adherence = summary.adherence.pct;

  // Cycle type: same (repeat / variant) or the next in sequence. Never backwards, never skipping one.
  if (!CYCLE_NAMES[p.cycle_type]) errors.push(`unknown cycle type ${p.cycle_type}`);
  else if (p.cycle_type !== cur && p.cycle_type !== NEXT_CYCLE[cur]) errors.push(`cycle type ${cur} → ${p.cycle_type} is not allowed`);
  else if (p.cycle_type !== cur && adherence < cfg(settings, 'ai.repeat_cycle_below_adherence_pct')) {
    review.push(`moves to ${p.cycle_type} with ${adherence}% adherence (below ${cfg(settings, 'ai.repeat_cycle_below_adherence_pct')}%)`);
  }

  // Days per week: 2–4; 4 only from C2 on; never more than one day above what she chose; she confirms in the app.
  if (![2, 3, 4].includes(p.days_per_week)) errors.push(`days per week ${p.days_per_week} is not 2, 3 or 4`);
  else {
    if (p.days_per_week === 4 && p.cycle_type === 'C1') errors.push('4 days a week is not offered in Foundations');
    const base = summary.reflection.days ?? summary.cycle.days_per_week;
    if (p.days_per_week > base) review.push(`recommends ${p.days_per_week} days (she chose ${base})`);
    if (p.days_per_week > summary.cycle.days_per_week && adherence < 75) review.push(`more days with ${adherence}% adherence`);
  }

  // Level changes: ±1, one per pattern, a real pattern, the result within 1–4.
  const seen = new Set();
  for (const c of p.level_changes) {
    if (!PATTERNS.includes(c.pattern)) { errors.push(`unknown pattern ${c.pattern}`); continue; }
    if (seen.has(c.pattern)) errors.push(`more than one level change for ${c.pattern}`);
    seen.add(c.pattern);
    if (c.change !== 1 && c.change !== -1) { errors.push(`level change for ${c.pattern} must be +1 or -1`); continue; }
    const now = profile.patternLevels?.[c.pattern] ?? 1;
    if (now + c.change < 1 || now + c.change > 4) errors.push(`${c.pattern} level ${now} ${c.change > 0 ? '+' : ''}${c.change} is out of range`);
    if (!c.evidence) review.push(`no evidence given for the ${c.pattern} change`);
    const pat = summary.patterns[c.pattern];
    if (c.change > 0 && (pat?.ratings?.hard ?? 0) > (pat?.ratings?.good ?? 0) + (pat?.ratings?.easy ?? 0)) review.push(`${c.pattern} up despite mostly Hard ratings`);
    if (c.change > 0 && (summary.flags.pain || summary.flags.dizzy)) review.push(`${c.pattern} up in a cycle with pain or dizzy flags`);
  }
  if (p.level_changes.length > 4) review.push(`${p.level_changes.length} level changes (more than 4)`);

  // Swaps: within her filtered library, same pattern, a level she'll be at, at most the admin limit.
  const levels = applyLevelChanges(profile.patternLevels || {}, p.level_changes.filter((c) => PATTERNS.includes(c.pattern) && Math.abs(c.change) === 1));
  const lib = Object.fromEntries(library.map((e) => [e.id, e]));
  const max = cfg(settings, 'ai.max_exercise_swaps');
  if (p.swaps.length > max) errors.push(`${p.swaps.length} exercise swaps (the limit is ${max})`);
  const swapped = new Set();
  for (const s of p.swaps) {
    const ex = lib[s.exercise_id];
    if (!ex) { errors.push(`exercise ${s.exercise_id} is not in the library`); continue; }
    if (ex.pattern !== s.pattern) errors.push(`${s.exercise_id} is not a ${s.pattern} exercise`);
    if (swapped.has(s.pattern)) errors.push(`two swaps for ${s.pattern}`);
    swapped.add(s.pattern);
    const ctx = contextFor({ pattern: ex.pattern }, { ...profile, patternLevels: levels });
    if (!eligible(ex, ctx)) errors.push(`${s.exercise_id} doesn't fit her equipment, restrictions or level`);
  }

  // Words: length, banned topics (weight, BMI, medication, body shape, medical claims, labels).
  if (!p.recap) errors.push('no recap');
  if (wordCount(p.recap) > cfg(settings, 'ai.recap_max_words')) errors.push(`recap is ${wordCount(p.recap)} words (limit ${cfg(settings, 'ai.recap_max_words')})`);
  for (const [name, text] of [['recap', p.recap], ['focus', p.focus], ...p.level_changes.map((c) => ['evidence', c.evidence])]) {
    const m = BANNED.exec(text || '');
    if (m) errors.push(`${name} uses "${m[0]}"`);
  }
  if (!p.focus || p.focus.length > 80) errors.push('focus must be 1–80 characters');
  if (p.flags.length) review.push(...p.flags.map((f) => `AI flag: ${f.reason}`));
  return { errors, review };
}

/** The tool the model must call (forced), so the output is structured. */
export const PROPOSAL_TOOL = {
  name: 'propose_next_cycle',
  description: 'Propose the patient’s next 9-week strength cycle within the program rules.',
  input_schema: {
    type: 'object',
    required: ['cycle_type', 'days_per_week', 'level_changes', 'swaps', 'recap', 'focus', 'flags'],
    properties: {
      cycle_type: { type: 'string', enum: ['C1', 'C2', 'C3'], description: 'Same type (repeat with fresh exercises) or the next in sequence.' },
      days_per_week: { type: 'integer', enum: [2, 3, 4] },
      level_changes: { type: 'array', items: { type: 'object', required: ['pattern', 'change', 'evidence'], properties: {
        pattern: { type: 'string', enum: PATTERNS }, change: { type: 'integer', enum: [-1, 1] },
        evidence: { type: 'string', description: 'One sentence citing her data.' } } } },
      swaps: { type: 'array', items: { type: 'object', required: ['pattern', 'exercise_id', 'reason'], properties: {
        pattern: { type: 'string', enum: PATTERNS }, exercise_id: { type: 'string', description: 'An id from library_options for that pattern.' },
        reason: { type: 'string' } } } },
      recap: { type: 'string', description: 'To her, second person, warm and specific, at most 120 words. No weight, BMI, body shape, medication or nutrition.' },
      focus: { type: 'string', description: 'A short focus for the next cycle, at most 80 characters.' },
      flags: { type: 'array', items: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } },
        description: 'Anything the program team should look at.' },
    },
  },
};

/** System and user messages for the review. `brief` is the private coach brief (imported with the content). */
export function buildPrompt(summary, options, brief, settings) {
  const system = [
    'You are the strength coach for a clinic program for adults, mostly women 40–60, who are losing weight with medical support.',
    'You review one 9-week cycle and propose the next one by calling propose_next_cycle. Follow these rules exactly:',
    `- cycle_type: the same type (a repeat with fresh exercises) or the next in sequence (C1 Foundations → C2 Building → C3 Strong & Consistent → C3 again). Repeat when adherence is under ${cfg(settings, 'ai.repeat_cycle_below_adherence_pct')}% or most sessions felt too hard.`,
    '- days_per_week: 2, 3 or 4 (4 only from C2 on). Start from the days she chose; she confirms.',
    '- level_changes: at most one per movement pattern, +1 or -1 only, each with one sentence of evidence from her data. Raise a level only with steady progress, mostly Good/Easy ratings and no pain flags on that pattern.',
    `- swaps: at most ${cfg(settings, 'ai.max_exercise_swaps')}, only ids listed in library_options for that pattern, to freshen things up or work around a sore area.`,
    `- recap: written to her in plain, warm, specific language, at most ${cfg(settings, 'ai.recap_max_words')} words. Celebrate consistency and strength. Never mention body weight, BMI, body shape, appearance, medication, diet or nutrition, and give no medical advice.`,
    '- flags: anything worrying (repeated pain, dizziness, a sharp drop in attendance) for the program team.',
    brief ? `\nProgram brief:\n${brief}` : '',
  ].join('\n');
  const user = `Cycle summary (de-identified):\n${JSON.stringify(summary)}\n\nlibrary_options (per pattern, ids she may be given):\n${JSON.stringify(options)}\n\nPattern names: ${JSON.stringify(PATTERN_NAMES)}`;
  return { system, user };
}
