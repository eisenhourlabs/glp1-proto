// Cycle review handler (Framework §14), written as plain JS so it runs in Node tests with fake dependencies.
// scripts/build_functions.mjs bundles it with the engine into supabase/functions/ai-cycle-review/index.ts.
//
// deps: { db (service-role supabase client), getUser(token) → {id}|null, callModel({system, user}, tool) → tool input
//         (null when no API key; throws on failure), today: ISO date, model: string }

import { cycleSummary, libraryOptions, defaultProposal, reviewProfile, levelCeilings } from '../../../web/engine/review.js';
import { normalizeProposal, validateProposal, PROPOSAL_TOOL, buildPrompt } from '../../../web/engine/review_validate.js';
import { weekOfCycle } from '../../../web/engine/cycle.js';
import { addDays } from '../../../web/engine/util.js';
import { choicesOnly } from '../../../web/engine/reflection.js';

const must = ({ data, error }) => { if (error) throw error; return data; };
/** Her reflection: only the fixed choices (engine/reflection.js, backlog E4) go anywhere near the AI. The free-text
 *  note is stored with the proposal for the team and never enters the summary or the prompt. */
export function cleanReflection(r = {}) {
  return { ...choicesOnly(r), note: r?.note ? String(r.note).slice(0, 500) : null };
}

export async function reviewCycle({ token, body = {} }, deps) {
  const { db } = deps;
  const user = token ? await deps.getUser(token) : null;
  if (!user) return { status: 401, body: { error: 'auth' } };
  const me = must(await db.from('profiles').select('role').eq('id', user.id).maybeSingle());
  const isAdmin = me?.role === 'admin';
  const patientId = isAdmin && body.patient_id ? body.patient_id : me?.role === 'patient' ? user.id : null;
  if (!patientId) return { status: 403, body: { error: 'forbidden' } };

  const cycle = must(await db.from('cycles').select('*').eq('patient_id', patientId).eq('status', 'active').maybeSingle());
  if (!cycle) return { status: 404, body: { error: 'no_cycle' } };
  const existing = must(await db.from('ai_proposals').select('*').eq('cycle_id', cycle.id).maybeSingle());
  if (existing) return { status: 200, body: { proposal: existing } };
  // Week 9 is the transition week; allow a day of slack for her time zone.
  if (!isAdmin && weekOfCycle(cycle.start_date, addDays(deps.today, 1)) < 9) return { status: 400, body: { error: 'too_early' } };

  const [patient, library, templates, logs, exerciseLogs, flags, adjustments, settingRows, setups] = await Promise.all([
    db.from('patients').select('*').eq('id', patientId).single().then(must),
    db.from('content_exercises').select('*').eq('version', cycle.content_version).then(must),
    db.from('content_templates').select('*').eq('version', cycle.content_version).then(must),
    db.from('session_logs').select('*').eq('cycle_id', cycle.id).then(must),
    db.from('exercise_logs').select('exercise_id, sets, rating, skipped, created_at').eq('patient_id', patientId).gte('created_at', cycle.start_date).then(must),
    db.from('flags').select('type, detail, created_at').eq('patient_id', patientId).gte('created_at', cycle.start_date).then(must),
    db.from('adjustments').select('type, reason').eq('cycle_id', cycle.id).then(must),
    db.from('app_settings').select('key, value').then(must),
    db.from('content_setups').select('setup, level_ceiling, pattern_ceilings').eq('version', cycle.content_version).then(must),
  ]);
  const settings = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const reflection = cleanReflection(body.reflection);
  const template = templates.find((t) => t.template_id === cycle.template_id);
  const summary = cycleSummary({ patient, cycle, template, logs, exerciseLogs, flags, adjustments, library, reflection });
  const profile = reviewProfile(patient);
  const options = libraryOptions(profile, library.filter((e) => e.active));
  const active = library.filter((e) => e.active);
  const ceilings = levelCeilings(profile, setups.find((s) => s.setup === patient.setup) ?? null, active);
  const fallback = defaultProposal(summary, { settings, ceilings });

  let source = 'default'; let output = fallback; let aiError = null; let validation = { errors: [], review: [] };
  try {
    const raw = await deps.callModel(buildPrompt(summary, options, typeof settings['ai.coach_brief'] === 'string' ? settings['ai.coach_brief'] : '', settings), PROPOSAL_TOOL);
    if (raw == null) aiError = 'no_api_key';
    else {
      const p = normalizeProposal(raw);
      source = 'ai';
      output = p ?? { invalid: raw };
      validation = validateProposal(p, { summary, library, profile, settings });
    }
  } catch (e) {
    aiError = String(e?.message ?? e).slice(0, 300);
  }
  const status = validation.errors.length || validation.review.length ? 'pending' : 'ready';
  const row = {
    patient_id: patientId, cycle_id: cycle.id, reflection, input_summary: summary, source, model: source === 'ai' ? deps.model : null,
    ai_error: aiError, output, default_output: fallback, validation, status, final: status === 'ready' ? output : fallback,
  };
  const saved = must(await db.from('ai_proposals').insert(row).select().single());
  return { status: 200, body: { proposal: saved } };
}
