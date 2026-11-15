// Reads that still work without a signal (backlog C4): network first; on a network failure, the last copy saved on
// this phone. Only failures of the connection itself fall back; a database error (permission, bad query) is thrown.
// The copies are the signed-in user's own data, keyed by user, and are wiped on sign-out (shared/supa.js).
import { idbGet, idbPut, idbClear } from './idb.js';

/** A failed request that never reached the database (supabase-js reports these with an empty error code). */
export function isNetworkError(e) {
  if (!e) return false;
  if (e.code) return false;                                   // Postgres / PostgREST errors always carry a code
  return /fetch|network|load failed|offline|timed? ?out/i.test(`${e.name ?? ''} ${e.message ?? e}`);
}

/** Thrown when there is no signal and nothing saved for this read yet. */
export class OfflineError extends Error {
  constructor(key) { super(`offline: nothing saved for ${key}`); this.name = 'OfflineError'; }
}

/**
 * Network first, saved copy as the fallback → { data, fresh } (fresh = it came from the server just now).
 * fn() returns the data (throws on error). The copy is saved in the background so online reads are not slowed.
 */
export async function fetchOrSaved(key, fn) {
  try {
    const data = await fn();
    idbPut('reads', { data, at: Date.now() }, key).catch(() => {});
    return { data, fresh: true };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const hit = await idbGet('reads', key);
    if (hit) return { data: structuredClone(hit.data), fresh: false };
    throw new OfflineError(key);
  }
}

/** Replace a saved copy with data just written (e.g. a plan built after the read that saved "none"). */
export const saveCopy = (key, data) => idbPut('reads', { data, at: Date.now() }, key).catch(() => {});

/** fetchOrSaved, data only. */
export const remember = async (key, fn) => (await fetchOrSaved(key, fn)).data;

/** Forget every saved read (on sign-out). Queued writes are kept: they belong to a user and wait for them. */
export const clearReads = () => idbClear('reads');
