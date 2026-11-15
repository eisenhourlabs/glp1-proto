// Merge what the phone knows (the outbox mirror) into rows read from the server or from the saved copy (C4).
// Rule: a row with a write still queued, or any row when the read came from the saved copy, shows the phone's
// version; after a fresh read with nothing queued the server wins and the phone's copy is dropped.
import { mirrorRows, pendingKeys, prune, isRef, mirrorGet, serverId } from './outbox.js';

const strip = ({ _partial, _deleted, patient_id: _p, ...r }) => ({ patient_id: _p, ...r });

/**
 * serverRows: rows from the read. prefix: mirror kind ('s:', 'e:', 'f:', 'a:'). fresh: from the server just now.
 * same(server, local): the same row? keep(local): does this local row belong in this read (e.g. same cycle)?
 */
export async function overlay(serverRows, prefix, { fresh, same, keep = () => true }) {
  const entries = (await mirrorRows(prefix)).filter((x) => x.value._partial || keep(x.value));
  if (!entries.length) return serverRows;
  const busy = await pendingKeys();
  const out = serverRows.map((r) => ({ ...r }));
  const drop = new Set();
  for (const x of entries) {
    const i = out.findIndex((r) => same(r, x.value));
    const phoneWins = busy.has(x.key) || !fresh;
    if (i >= 0) {
      if (!phoneWins) continue;
      if (x.value._deleted) drop.add(out[i]); else Object.assign(out[i], strip(x.value));
    } else if (!x.value._partial && !x.value._deleted) out.push(strip(x.value));
  }
  if (fresh) await prune(entries, (v) => (v._deleted ? !serverRows.some((r) => same(r, v)) : serverRows.some((r) => same(r, v))));
  return out.filter((r) => !drop.has(r));
}

export const sameSession = (r, v) => (v.client_ref && r.client_ref === v.client_ref) || (v.id != null && r.id === v.id);
export const sameByRef = (r, v) => Boolean(v.client_ref) && r.client_ref === v.client_ref;

/** The phone's name for a workout: its client_ref, or "id<n>" for one it has no ref for. */
export async function sessionCanon(handle) {
  if (isRef(handle)) return handle.slice(4);
  return mirrorGet(`i:${handle}`) ?? `id${handle}`;
}

/** The server id behind a handle, or null while a workout made on this phone hasn't been sent yet. */
export async function serverIdOf(handle) { return serverId(handle); }

/** A flag/adjustment detail pointing at a workout: use its server id once known (so comparisons with log.id hold). */
export async function withServerIds(rows) {
  return Promise.all(rows.map(async (r) => {
    if (!isRef(r.detail?.session_log_id)) return r;
    const id = await serverIdOf(r.detail.session_log_id);
    return id == null ? r : { ...r, detail: { ...r.detail, session_log_id: id } };
  }));
}
