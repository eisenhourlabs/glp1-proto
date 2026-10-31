// Data access for the patient app. Every call is scoped by row-level security to the signed-in patient.
import { db } from '../shared/supa.js';
import { startingLevels, startingCycle } from '../engine/levels.js';
import { chooseTemplate, materializeCycle } from '../engine/cycle.js';
import { applyLevelChanges, slotsWithSwaps } from '../engine/review.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

/** Local calendar date as ISO (the UI layer is allowed a clock; the engine is not). */
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const loadPatient = async (uid) => must(await db.from('patients').select('*').eq('id', uid).maybeSingle());
export const savePatient = async (uid, fields) => must(await db.from('patients').update(fields).eq('id', uid));

export async function signDocument(uid, { docType, version, signedName, answers = null }) {
  return must(await db.from('patient_documents').insert({
    patient_id: uid, doc_type: docType, doc_version: version, signed_name: signedName, answers,
    user_agent: (navigator.userAgent || '').slice(0, 200),
  }));
}

export const setScreening = async (redFlag) => must(await db.rpc('patient_set_screening', { p_red_flag: redFlag }));
export const completeOnboarding = async (startDate) => must(await db.rpc('patient_complete_onboarding', { p_start: startDate }));
export const selfClear = async (name, version) => must(await db.rpc('patient_self_clear', { p_signed_name: name, p_doc_version: version }));

let contentCache = null;
/** The current content version (library, templates, slots, setups, equipment). Cached for the session. */
export async function loadContent() {
  if (contentCache) return contentCache;
  const version = must(await db.rpc('content_current_version'));
  if (!version) throw new Error('No programming content has been imported yet.');
  const q = (table) => db.from(table).select('*').eq('version', version);
  const [library, templates, slots, setups, equipment] = await Promise.all(
    ['content_exercises', 'content_templates', 'content_slots', 'content_setups', 'content_equipment'].map(async (t) => must(await q(t))));
  contentCache = { version, library, templates, slots, setups, equipment };
  return contentCache;
}

/** The engine's view of a patient (resolve.js profile shape). */
export const engineProfile = (p) => ({
  equipment: p.equipment || [], patternLevels: p.pattern_levels || {}, workarounds: p.workarounds || [],
  restrictions: p.restrictions || [], floorOk: Boolean(p.floor_ok),
});

export async function activeCycle(uid) {
  const cycle = must(await db.from('cycles').select('*').eq('patient_id', uid).eq('status', 'active').maybeSingle());
  if (!cycle) return null;
  const items = must(await db.from('cycle_items').select('*').eq('cycle_id', cycle.id).order('session').order('ord'));
  return { ...cycle, items };
}

/**
 * Build and save her first cycle: starting levels (intake + movement check), cycle type, template, and the
 * exercise for every slot. Returns the saved cycle with items.
 */
export async function createFirstCycle(patient, content) {
  const patternLevels = startingLevels({ experience: patient.experience, check: patient.workout1_check || {}, ageBand: patient.age_band });
  const cycleType = startingCycle({ experience: patient.experience, check: patient.workout1_check || {} });
  const template = chooseTemplate(content.templates, { cycleType, daysPerWeek: patient.days_per_week, experienced: cycleType !== 'C1' });
  if (!template) throw new Error('No template fits this schedule.');
  const profile = engineProfile({ ...patient, pattern_levels: patternLevels });
  const plan = materializeCycle(template, content.slots, profile, content.library, { minutes: patient.session_minutes });
  await savePatient(patient.id, { pattern_levels: patternLevels });
  const cycle = must(await db.from('cycles').insert({
    patient_id: patient.id, cycle_no: 1, template_id: template.template_id, content_version: content.version,
    cycle_type: cycleType, start_date: patient.start_date || localToday(), session_minutes: patient.session_minutes, status: 'active',
  }).select().single());
  const items = plan.sessions.flatMap((s) => s.items.map((it) => ({
    cycle_id: cycle.id, patient_id: patient.id, session: s.session, slot: it.slot.slot, ord: it.slot.ord,
    role: it.slot.role, pattern: it.slot.pattern, exercise_id: it.exercise?.id ?? null, reasons: it.reasons,
  })));
  must(await db.from('cycle_items').insert(items));
  return { ...cycle, items };
}

/**
 * Start her next cycle from a review plan: level changes, the cycle type and her confirmed days/length, swaps, and
 * (for a repeated cycle type) fresh exercises where there's a choice. Closes the old cycle; reopens it if anything fails.
 */
export async function createNextCycle(patient, oldCycle, plan, content, { days, minutes, proposalId = null }) {
  const cycleType = plan.cycle_type;
  const daysPerWeek = cycleType === 'C1' && days === 4 ? 3 : days;
  const template = chooseTemplate(content.templates, { cycleType, daysPerWeek, experienced: cycleType !== 'C1' });
  if (!template) throw new Error('No template fits this schedule.');
  const levels = applyLevelChanges(patient.pattern_levels || {}, plan.level_changes || []);
  const profile = engineProfile({ ...patient, pattern_levels: levels });
  const slots = slotsWithSwaps(content.slots.filter((s) => s.template_id === template.template_id), plan.swaps || []);
  const avoid = cycleType === oldCycle.cycle_type ? oldCycle.items.map((i) => i.exercise_id).filter(Boolean) : [];
  const built = materializeCycle(template, slots, profile, content.library, { minutes, used: avoid });
  must(await db.from('cycles').update({ status: 'done' }).eq('id', oldCycle.id));
  let cycle;
  try {
    cycle = must(await db.from('cycles').insert({
      patient_id: patient.id, cycle_no: oldCycle.cycle_no + 1, template_id: template.template_id, content_version: content.version,
      cycle_type: cycleType, start_date: localToday(), session_minutes: minutes, status: 'active',
    }).select().single());
    const items = built.sessions.flatMap((s) => s.items.map((it) => ({
      cycle_id: cycle.id, patient_id: patient.id, session: s.session, slot: it.slot.slot, ord: it.slot.ord,
      role: it.slot.role, pattern: it.slot.pattern, exercise_id: it.exercise?.id ?? null, reasons: it.reasons,
    })));
    must(await db.from('cycle_items').insert(items));
  } catch (e) {
    await db.from('cycles').update({ status: 'active' }).eq('id', oldCycle.id);
    if (cycle) await db.from('cycles').update({ status: 'abandoned' }).eq('id', cycle.id);
    throw e;
  }
  await savePatient(patient.id, { pattern_levels: levels, days_per_week: daysPerWeek, session_minutes: minutes });
  if (proposalId) await db.from('ai_proposals').update({ applied_cycle_id: cycle.id }).eq('id', proposalId);
  return cycle;
}
