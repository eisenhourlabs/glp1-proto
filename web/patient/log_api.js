// Workout logging: session logs, exercise logs, flags, settings and the week-mode record. RLS scopes every call
// to the signed-in patient.
import { db } from '../shared/supa.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

let settingsCache = null;
/** Tunable settings (Framework ⚙ values) as {key: number}. */
export async function loadSettings() {
  if (settingsCache) return settingsCache;
  const rows = must(await db.from('app_settings').select('key,value'));
  settingsCache = Object.fromEntries(rows.map((r) => [r.key, typeof r.value === 'object' && r.value !== null && 'value' in r.value ? r.value.value : r.value]));
  return settingsCache;
}

let warmupCache = null;
export async function loadWarmups(version) {
  if (warmupCache?.version === version) return warmupCache.rows;
  const rows = must(await db.from('content_warmups').select('*').eq('version', version));
  warmupCache = { version, rows };
  return rows;
}

/** Every session log of this cycle (small: at most a few per week). */
export const cycleLogs = async (cycleId) =>
  must(await db.from('session_logs').select('*').eq('cycle_id', cycleId).order('log_date', { ascending: true }).order('id'));

/** The date of her last completed workout (any cycle), or null. */
export async function lastWorkoutDate(uid) {
  const rows = must(await db.from('session_logs').select('log_date').eq('patient_id', uid).in('status', ['done', 'partial'])
    .order('log_date', { ascending: false }).limit(1));
  return rows[0]?.log_date ?? null;
}

export const flagsSince = async (uid, fromIso) =>
  must(await db.from('flags').select('id,type,detail,created_at').eq('patient_id', uid).gte('created_at', fromIso));

/** Last few logs per exercise, newest first: {exerciseId: rows}. */
export async function exerciseHistory(uid, exerciseIds, { perExercise = 2, excludeSession = null } = {}) {
  if (!exerciseIds.length) return {};
  const rows = must(await db.from('exercise_logs').select('session_log_id,exercise_id,sets,rating,skipped,created_at')
    .eq('patient_id', uid).in('exercise_id', exerciseIds).eq('skipped', false)
    .order('created_at', { ascending: false }).limit(exerciseIds.length * 6));
  const out = {};
  for (const r of rows) {
    if (r.session_log_id === excludeSession) continue;
    const list = (out[r.exercise_id] ||= []);
    if (list.length < perExercise) list.push(r);
  }
  return out;
}

export async function startSession(uid, { cycleId, week, session, day, energy, workaroundAreas, scaled }) {
  return must(await db.from('session_logs').insert({
    patient_id: uid, cycle_id: cycleId, week, session, log_date: day, status: 'in_progress',
    energy, workaround_areas: workaroundAreas, scaled, started_at: new Date().toISOString(),
  }).select().single());
}

export const sessionExerciseLogs = async (sessionLogId) =>
  must(await db.from('exercise_logs').select('*').eq('session_log_id', sessionLogId));

/** Save one exercise's sets so far (called after every set, so nothing is lost if she closes the app). */
export async function saveExercise(uid, sessionLogId, { slot, exerciseId, swappedFrom = null, swapReason = null, sets, rating = null, skipped = false }) {
  return must(await db.from('exercise_logs').upsert({
    session_log_id: sessionLogId, patient_id: uid, slot, exercise_id: exerciseId, swapped_from: swappedFrom,
    swap_reason: swapReason, sets, rating, skipped,
  }, { onConflict: 'session_log_id,slot' }));
}

export async function finishSession(sessionLogId, status, extra = {}) {
  return must(await db.from('session_logs').update({ status, finished_at: new Date().toISOString(), ...extra }).eq('id', sessionLogId));
}

export const discardSession = async (sessionLogId) => must(await db.from('session_logs').delete().eq('id', sessionLogId));

export const raiseFlag = async (uid, type, detail) => must(await db.from('flags').insert({ patient_id: uid, type, detail }));

/** Store the week-4/9 decision on the cycle so it stays fixed for that week. */
export async function saveWeekMode(cycle, week, decision) {
  const week_modes = { ...(cycle.week_modes || {}), [String(week)]: { mode: decision.mode, consistent: decision.consistent, restReasons: decision.restReasons } };
  must(await db.from('cycles').update({ week_modes }).eq('id', cycle.id));
  cycle.week_modes = week_modes;
}

/** "Start today" when her chosen start date is still ahead. */
export async function updateCycleStart(cycle, day) {
  must(await db.from('cycles').update({ start_date: day }).eq('id', cycle.id));
  cycle.start_date = day;
}

/** Her post-workout check-in on the session log. fields: { feel, soreness, sore_areas, note } */
export const saveCheckin = async (sessionLogId, fields) => must(await db.from('session_logs').update(fields).eq('id', sessionLogId));

export const cycleAdjustments = async (cycleId) =>
  must(await db.from('adjustments').select('*').eq('cycle_id', cycleId).order('id'));

export const addAdjustment = async (uid, cycleId, { type, reason, detail }) =>
  must(await db.from('adjustments').insert({ patient_id: uid, cycle_id: cycleId, type, reason, detail }));

/** Every logged exercise (for strength wins). Small: a few hundred rows over a cycle. */
export const allExerciseLogs = async (uid) =>
  must(await db.from('exercise_logs').select('exercise_id,sets,skipped,created_at').eq('patient_id', uid).eq('skipped', false).order('created_at'));
