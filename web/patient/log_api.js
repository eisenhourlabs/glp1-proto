// Workout logging: session logs, exercise logs, flags, settings and the week-mode record. RLS scopes every call
// to the signed-in patient. Reads work offline from the last saved copy plus what she did on this phone (C4);
// the workout writes are in log_writes.js (through the outbox) and re-exported here.
import { db } from '../shared/supa.js';
import { remember, fetchOrSaved, OfflineError } from '../shared/offline.js';
import { idbGet } from '../shared/idb.js';
import { currentUser } from './outbox.js';
import { overlay, sameSession, sameByRef, sessionCanon, serverIdOf, withServerIds } from './overlay.js';

export { startSession, skipToday, finishSession, saveCheckin, discardSession, saveExercise, raiseFlag, addAdjustment } from './log_writes.js';

const must = ({ data, error }) => { if (error) throw error; return data; };
/** Saved-copy key: per user, per read. */
const k = (name, ...args) => `${currentUser()}:${name}:${args.map((a) => JSON.stringify(a)).join(':')}`;
const byDate = (a, b) => String(a.log_date).localeCompare(String(b.log_date))
  || String(a.started_at ?? a.created_at ?? '').localeCompare(String(b.started_at ?? b.created_at ?? ''));
const byCreated = (a, b) => String(a.created_at).localeCompare(String(b.created_at));
/** For lists: with no signal and no saved copy of this exact read, start from nothing and add what this phone knows. */
async function listOrSaved(key, fn, fallback = async () => []) {
  try { return await fetchOrSaved(key, fn); }
  catch (e) { if (e instanceof OfflineError) return { data: await fallback(), fresh: false }; throw e; }
}
const sameExercise = (r, v) => r.slot === v.slot && v.session_log_id != null && r.session_log_id === v.session_log_id;

let settingsCache = null;
/** Tunable settings (Framework ⚙ values) as {key: number}. */
export async function loadSettings() {
  if (settingsCache) return settingsCache;
  const rows = await remember(k('settings'), async () => must(await db.from('app_settings').select('key,value')));
  settingsCache = Object.fromEntries(rows.map((r) => [r.key, typeof r.value === 'object' && r.value !== null && 'value' in r.value ? r.value.value : r.value]));
  return settingsCache;
}

let warmupCache = null;
export async function loadWarmups(version) {
  if (warmupCache?.version === version) return warmupCache.rows;
  const rows = await remember(k('warmups', version), async () => must(await db.from('content_warmups').select('*').eq('version', version)));
  warmupCache = { version, rows };
  return rows;
}

/** Every session log of this cycle (small: at most a few per week), including workouts saved on this phone. */
export async function cycleLogs(cycleId) {
  const { data, fresh } = await fetchOrSaved(k('cycleLogs', cycleId), async () =>
    must(await db.from('session_logs').select('*').eq('cycle_id', cycleId).order('log_date', { ascending: true }).order('id')));
  return (await overlay(data, 's:', { fresh, same: sameSession, keep: (v) => v.cycle_id === cycleId })).sort(byDate);
}

/** Her last `n` completed workouts (any cycle), newest first: [{ date, cycleStart }] (cycleStart = start of its cycle). */
export async function recentWorkouts(uid, n = 2) {
  const done = (r) => ['done', 'partial'].includes(r.status);
  const { data, fresh } = await listOrSaved(k('recent', n), async () => must(await db.from('session_logs')
    .select('id,client_ref,log_date,cycle_id,status').eq('patient_id', uid).in('status', ['done', 'partial'])
    .order('log_date', { ascending: false }).limit(n)));
  const rows = (await overlay(data, 's:', { fresh, same: sameSession, keep: done })).filter(done).sort((a, b) => byDate(b, a)).slice(0, n);
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.cycle_id))].sort();
  const cycles = (await listOrSaved(k('cycleStarts', ids), async () => must(await db.from('cycles').select('id,start_date').in('id', ids)),
    async () => { const c = (await idbGet('reads', `${currentUser()}:activeCycle`))?.data; return c ? [{ id: c.id, start_date: c.start_date }] : []; })).data;
  const start = Object.fromEntries(cycles.map((c) => [c.id, c.start_date]));
  return rows.map((r) => ({ date: r.log_date, cycleStart: start[r.cycle_id] ?? null }));
}

/** Flags or adjustments: server (or saved copy) + rows made on this phone, matched by client_ref. */
async function refRows(table, prefix, key, where, keep, cols = '*') {
  const { data, fresh } = await listOrSaved(key, async () => must(await where(db.from(table).select(cols))));
  return withServerIds(await overlay(data, prefix, { fresh, same: sameByRef, keep }));
}

/** Pain reports (any time) and "Feeling better" taps: what standingAreas() needs (B7). */
export async function standingInputs(uid) {
  const cols = 'type,detail,created_at,client_ref';
  const [pain, clears] = await Promise.all([
    refRows('flags', 'f:', k('pain'), (q) => q.eq('patient_id', uid).eq('type', 'pain'), (v) => v.type === 'pain', cols),
    refRows('adjustments', 'a:', k('clears'), (q) => q.eq('patient_id', uid).eq('type', 'workaround_cleared'),
      (v) => v.type === 'workaround_cleared', cols),
  ]);
  return { pain, clears };
}

export const flagsSince = (uid, fromIso) => refRows('flags', 'f:', k('flagsSince', fromIso),
  (q) => q.eq('patient_id', uid).gte('created_at', fromIso), (v) => String(v.created_at) >= String(fromIso),
  'id,type,detail,created_at,client_ref');

export const cycleAdjustments = async (cycleId) => (await refRows('adjustments', 'a:', k('adjustments', cycleId),
  (q) => q.eq('cycle_id', cycleId).order('id'), (v) => v.cycle_id === cycleId)).sort(byCreated);

/** Last few logs per exercise, newest first: {exerciseId: rows}. */
export async function exerciseHistory(uid, exerciseIds, { perExercise = 2, excludeSession = null } = {}) {
  if (!exerciseIds.length) return {};
  const ids = [...exerciseIds].sort();
  const { data, fresh } = await listOrSaved(k('history', ids), async () => must(await db.from('exercise_logs')
    .select('session_log_id,slot,exercise_id,sets,rating,skipped,created_at').eq('patient_id', uid).in('exercise_id', ids)
    .eq('skipped', false).order('created_at', { ascending: false }).limit(ids.length * 6)),
  // offline and this exact list never read: her whole saved history (home saves it) still gives "last time"
  async () => ((await idbGet('reads', k('allEx')))?.data ?? []).filter((r) => ids.includes(r.exercise_id)));
  const rows = (await overlay(data, 'e:', { fresh, same: sameExercise, keep: (v) => ids.includes(v.exercise_id) && !v.skipped }))
    .sort((a, b) => byCreated(b, a));
  const skipRef = excludeSession == null ? null : await sessionCanon(excludeSession);
  const skipId = excludeSession == null ? null : await serverIdOf(excludeSession);
  const out = {};
  for (const r of rows) {
    if (skipRef && (r.session_ref === skipRef || (skipId != null && r.session_log_id === skipId))) continue;
    const list = (out[r.exercise_id] ||= []);
    if (list.length < perExercise) list.push(r);
  }
  return out;
}

/** Her exercise logs for one workout (also one made on this phone and not sent yet). */
export async function sessionExerciseLogs(handle) {
  const id = await serverIdOf(handle);
  const canon = await sessionCanon(handle);
  const { data, fresh } = id == null ? { data: [], fresh: false }
    : await listOrSaved(k('sessionEx', id), async () => must(await db.from('exercise_logs').select('*').eq('session_log_id', id)));
  return overlay(data, `e:${canon}|`, { fresh, same: (r, v) => r.slot === v.slot });
}

/** Store the week-4/9 decision on the cycle so it stays fixed for that week (recomputed next time if offline). */
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

/** Every logged exercise (for strength wins). Small: a few hundred rows over a cycle. */
export async function allExerciseLogs(uid) {
  const { data, fresh } = await listOrSaved(k('allEx'), async () => must(await db.from('exercise_logs')
    .select('session_log_id,slot,exercise_id,sets,rating,skipped,created_at').eq('patient_id', uid).eq('skipped', false).order('created_at')));
  return (await overlay(data, 'e:', { fresh, same: sameExercise, keep: (v) => !v.skipped })).sort(byCreated);
}

/** With a signal, save what a workout needs so one can start offline later this week (C4). Never blocks. */
export function prefetchForOffline(uid, version) {
  if (navigator.onLine === false) return;
  Promise.all([loadWarmups(version), allExerciseLogs(uid)]).catch((e) => console.warn('prefetch', e?.message ?? e));
}

/** The review for a cycle (her own row), or null. */
export const cycleProposal = async (cycleId) => remember(k('proposal', cycleId), async () =>
  must(await db.from('ai_proposals').select('id, status, source, final, reflection, created_at').eq('cycle_id', cycleId).maybeSingle()));

/** Run the end-of-cycle review (Edge Function). Returns the proposal row, or throws. */
export async function runReview(reflection) {
  const { data, error } = await db.functions.invoke('ai-cycle-review', { body: { reflection } });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw Object.assign(new Error(detail?.error ?? 'review_failed'), { code: detail?.error ?? null });
  }
  return data.proposal;
}

export const myFlags = async (uid) => must(await db.from('flags').select('type, detail, created_at').eq('patient_id', uid));
