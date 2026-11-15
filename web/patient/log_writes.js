// Workout writes, all through the outbox (C4): each is applied on the phone at once and sent now or when the
// signal is back. Times (started_at, finished_at) are taken when she acts, not when the write is sent.
import { submit, newRef, isRef } from './outbox.js';
import { sessionCanon } from './overlay.js';

const now = () => new Date().toISOString();

/** A new session_logs row (a workout she starts, or a skip). Returns the row; its id is "ref:<uuid>" until sent. */
async function newSession(row) {
  const ref = newRef();
  const full = { ...row, client_ref: ref };
  const key = `s:${ref}`;
  const { value } = await submit({
    kind: 'session.start', payload: { row: full }, keys: [key],
    apply: (m) => { const v = { ...full, id: `ref:${ref}`, created_at: now() }; m.put(v, key); return v; },
  });
  return value;
}

/** Change a workout row (finish, check-in, delete). */
async function updateSession(handle, fields, { deleted = false } = {}) {
  const key = `s:${await sessionCanon(handle)}`;
  const { value } = await submit({
    kind: deleted ? 'session.delete' : 'session.update', payload: deleted ? { target: handle } : { target: handle, fields }, keys: [key],
    apply: (m) => {
      const base = m.get(key) ?? { id: handle, _partial: true };
      const v = deleted ? { ...base, _deleted: true } : { ...base, ...fields };
      m.put(v, key);
      return v;
    },
  });
  return value;
}

export const startSession = (uid, { cycleId, week, session, day, energy, workaroundAreas, scaled }) => newSession({
  patient_id: uid, cycle_id: cycleId, week, session, log_date: day, status: 'in_progress',
  energy, workaround_areas: workaroundAreas, scaled, started_at: now(),
});

/** "Can't train today" with a reason (the reason is what her clinic sees on the check-in list). */
export const skipToday = (uid, { cycleId, week, session, day, reason }) => newSession({
  patient_id: uid, cycle_id: cycleId, week, session, log_date: day, status: 'skipped', skip_reason: reason,
});

export const finishSession = (handle, status, extra = {}) => updateSession(handle, { status, finished_at: now(), ...extra });

/** Her post-workout check-in on the session log. fields: { feel, soreness, sore_areas, note } */
export const saveCheckin = (handle, fields) => updateSession(handle, fields);

export const discardSession = (handle) => updateSession(handle, null, { deleted: true });

/** Save one exercise's sets so far (after every set, so nothing is lost if she closes the app or loses signal). */
export async function saveExercise(uid, handle, { slot, exerciseId, swappedFrom = null, swapReason = null, sets, rating = null, skipped = false }) {
  const row = { patient_id: uid, slot, exercise_id: exerciseId, swapped_from: swappedFrom, swap_reason: swapReason, sets, rating, skipped };
  const canon = await sessionCanon(handle);
  const key = `e:${canon}|${slot}`;
  await submit({
    kind: 'exercise.save', payload: { target: handle, row }, keys: [key],
    apply: (m) => {
      const old = m.get(key);
      m.put({ ...row, session_ref: canon, session_log_id: isRef(handle) ? old?.session_log_id ?? handle : handle,
        created_at: old?.created_at ?? now() }, key);
    },
  });
}

/** A flag (dizzy, pain, problem, pattern). detail.session_log_id may point at a workout made on this phone.
 *  Returns { queued }: true when it is waiting on the phone for a signal. */
export async function raiseFlag(uid, type, detail) {
  const ref = newRef();
  const row = { patient_id: uid, type, detail: detail ?? {}, client_ref: ref };
  const { queued } = await submit({ kind: 'flag.insert', payload: { row }, keys: [`f:${ref}`],
    apply: (m) => m.put({ ...row, id: `ref:${ref}`, created_at: now() }, `f:${ref}`) });
  return { queued };
}

export async function addAdjustment(uid, cycleId, { type, reason, detail }) {
  const ref = newRef();
  const row = { patient_id: uid, cycle_id: cycleId, type, reason, detail: detail ?? {}, client_ref: ref };
  await submit({ kind: 'adjustment.insert', payload: { row }, keys: [`a:${ref}`],
    apply: (m) => m.put({ ...row, id: `ref:${ref}`, created_at: now() }, `a:${ref}`) });
}
