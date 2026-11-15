// Workouts that survive a bad signal (backlog C4). Every workout write goes through submit():
//   1. it is applied to a local copy of the rows (the "mirror"), so the screens show what she did at once, and
//      queued, both written synchronously to localStorage before anything else happens: a set tapped a moment
//      before she closes the app is already on the phone (IndexedDB, being asynchronous, could lose it);
//   2. the queue is sent in order right away (submit waits up to a few seconds), and again on "online", every 20 s
//      while anything waits, and when the app opens.
// New workouts, flags and adjustments carry a client_ref (migration 011), and every write is safe to send twice,
// so nothing is stored twice if the signal drops after the server saved it. A workout created offline is known as
// "ref:<uuid>" until it is sent; later writes that point at it are translated to its real id when they are sent.
// Storage is per user (key prefix CONFIG.STORAGE_PREFIX); sent rows are dropped once a fresh read shows them.
import { db } from '../shared/supa.js';
import { CONFIG } from '../config.js';
import { isNetworkError } from '../shared/offline.js';

const must = ({ data, error }) => { if (error) throw error; return data; };
let uid = null;
let flushing = null;
let timer = null;
const listeners = new Set();
let state = { pending: 0, offline: false };
const SEND_WAIT_MS = 4000;
const refused = new Map();   // op seq → error, for submit() to report

export const newRef = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
export const isRef = (h) => typeof h === 'string' && h.startsWith('ref:');
/** The signed-in patient (null before initOutbox). */
export const currentUser = () => uid;

// ── storage: { seq, ops: [...], mirror: { key: value } } per user ──
//    mirror keys: s:<ref|idN> sessions, e:<ref|idN>|<slot> exercise logs, f:/a:<ref> flags/adjustments,
//    r:<ref> → server id of a workout made on this phone, i:<id> → its ref (both kept: tiny)
const storageKeyNow = () => `${CONFIG.STORAGE_PREFIX}.outbox.${uid}`;   // STORAGE_PREFIX: this origin is shared
function load() {
  try { return JSON.parse(localStorage.getItem(storageKeyNow()) || 'null') ?? { seq: 0, ops: [], mirror: {} }; }
  catch { return { seq: 0, ops: [], mirror: {} }; }
}
function save(box) { localStorage.setItem(storageKeyNow(), JSON.stringify(box)); }
function change(fn) { const box = load(); const out = fn(box); save(box); return out; }

export const mirrorGet = (key) => structuredClone(load().mirror[key]);
/** Mirror rows whose key starts with prefix: [{ key, value }] (row values only, not the r:/i: links). */
export const mirrorRows = (prefix) => Object.entries(load().mirror)
  .filter(([k, v]) => k.startsWith(prefix) && v && typeof v === 'object').map(([key, value]) => ({ key, value }));
/** Keys of mirror rows that still have a queued write. */
export const pendingKeys = () => new Set(load().ops.flatMap((o) => o.keys));
/** Drop mirror rows the server now shows (after a fresh read), unless a write for them is still queued. */
export function prune(entries, onServer) {
  const busy = pendingKeys();
  const gone = entries.filter((x) => !busy.has(x.key) && onServer(x.value)).map((x) => x.key);
  if (gone.length) change((b) => { gone.forEach((k) => delete b.mirror[k]); });
}
/** The server id behind a handle, or null while a workout made on this phone hasn't been sent yet. */
export const serverId = (handle) => (isRef(handle) ? load().mirror[`r:${handle.slice(4)}`] ?? null : handle);

/** Start the outbox for the signed-in patient: send anything waiting and keep trying while something is. */
export function initOutbox(userId) {
  uid = userId;
  window.addEventListener('online', () => flush());
  window.addEventListener('offline', () => setState({ offline: true }));
  tidy();
  setState({ pending: load().ops.length });
  return flush();
}

/** Phone copies already sent and older than two weeks are no longer needed (reads show the server's rows). */
function tidy(now = Date.now()) {
  const busy = pendingKeys();
  change((b) => {
    for (const [k, v] of Object.entries(b.mirror)) {
      if (v && typeof v === 'object' && !busy.has(k) && now - Date.parse(v.created_at ?? v.started_at ?? 0) > 14 * 864e5) delete b.mirror[k];
    }
  });
}

/** fn({ pending, offline }) on every change; returns an unsubscribe function. */
export function onSyncChange(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((f) => { try { f(state); } catch (e) { console.error(e); } });
  clearInterval(timer); timer = null;
  if (state.pending) timer = setInterval(() => flush(), 20000);
}

// ── sending one write ──
class Waiting extends Error {}
const idOrWait = (handle) => { const id = serverId(handle); if (id == null) throw new Waiting(); return id; };
const resolveDetail = (detail) => (detail && isRef(detail.session_log_id) ? { ...detail, session_log_id: idOrWait(detail.session_log_id) } : detail);

const EXEC = {
  async 'session.start'(p) {
    must(await db.from('session_logs').upsert(p.row, { onConflict: 'client_ref', ignoreDuplicates: true }));
    const got = must(await db.from('session_logs').select('id').eq('client_ref', p.row.client_ref).maybeSingle());
    if (!got) throw Object.assign(new Error('workout not saved'), { code: 'not_saved' });
    const ref = p.row.client_ref;
    change((b) => {
      b.mirror[`r:${ref}`] = got.id; b.mirror[`i:${got.id}`] = ref;
      if (b.mirror[`s:${ref}`]) b.mirror[`s:${ref}`].id = got.id;
      for (const [k, v] of Object.entries(b.mirror)) if (k.startsWith(`e:${ref}|`)) v.session_log_id = got.id;
    });
  },
  async 'session.update'(p) { must(await db.from('session_logs').update(p.fields).eq('id', idOrWait(p.target))); },
  async 'session.delete'(p) { must(await db.from('session_logs').delete().eq('id', idOrWait(p.target))); },
  async 'exercise.save'(p) {
    must(await db.from('exercise_logs').upsert({ ...p.row, session_log_id: idOrWait(p.target) }, { onConflict: 'session_log_id,slot' }));
  },
  async 'flag.insert'(p) {
    must(await db.from('flags').upsert({ ...p.row, detail: resolveDetail(p.row.detail) }, { onConflict: 'client_ref', ignoreDuplicates: true }));
  },
  async 'adjustment.insert'(p) {
    must(await db.from('adjustments').upsert({ ...p.row, detail: resolveDetail(p.row.detail) }, { onConflict: 'client_ref', ignoreDuplicates: true }));
  },
};

/**
 * Record one write. apply(m) changes the local copies (m.get(key), m.put(value, key)) and returns the value to hand
 * back to the screen; it runs synchronously, in the same storage update as the queueing. keys: the mirror keys it
 * touches. Returns { value, queued } (queued = still waiting for a signal). A write the server refuses (not a
 * connection problem) throws, as before the outbox, and its local copies are removed.
 */
export async function submit({ kind, payload, keys, apply }) {
  if (!uid) throw new Error('outbox not started');
  let value; let seq;
  try {
    change((b) => {
      value = apply({ get: (k) => structuredClone(b.mirror[k]), put: (v, k) => { b.mirror[k] = { ...v, patient_id: uid }; } });
      seq = ++b.seq;
      b.ops.push({ seq, uid, kind, payload, keys, at: new Date().toISOString() });
    });
  } catch (e) {                                    // storage full or blocked: send it directly, as before C4
    console.warn('offline store unavailable', e);
    await EXEC[kind](payload);
    return { value: kind === 'session.start' ? { ...value, id: serverId(`ref:${payload.row.client_ref}`) ?? value?.id } : value, queued: false };
  }
  setState({ pending: load().ops.length });
  await Promise.race([flush(), new Promise((r) => setTimeout(r, SEND_WAIT_MS))]);
  if (refused.has(seq)) { const e = refused.get(seq); refused.delete(seq); throw e; }
  const queued = load().ops.some((o) => o.seq === seq);
  if (kind === 'session.start' && !queued) value = { ...value, id: serverId(`ref:${payload.row.client_ref}`) ?? value.id };
  return { value, queued };
}

/** Send what is waiting, in order, until the queue is empty or the connection fails. A refused write is set aside. */
export function flush() {
  if (!uid) return Promise.resolve();
  flushing ??= (async () => {
    await null;                                    // let flushing be set before this can finish
    try {
      for (let op = load().ops[0]; op; op = load().ops[0]) {
        try { await EXEC[op.kind](op.payload); }
        catch (e) {
          if (isNetworkError(e) || e instanceof Waiting) { setState({ offline: isNetworkError(e) }); break; }
          console.warn('A saved write was refused and set aside', op.kind, e);
          refused.set(op.seq, e);
          change((b) => { op.keys.forEach((k) => delete b.mirror[k]); b.refused = [...(b.refused ?? []), { ...op, error: String(e?.message ?? e) }].slice(-20); });
        }
        change((b) => { b.ops = b.ops.filter((o) => o.seq !== op.seq); });
        setState({ offline: false });
      }
    } finally {
      const pending = load().ops.length;
      setState({ pending, offline: pending ? state.offline : false });
      flushing = null;
    }
  })();
  return flushing;
}
