// Edge Function `client-error` (backlog A14): the apps post a browser error here; it is cleaned again and stored with
// record_client_error() (migration 012), which counts repeats and enforces the limits. Public (no login needed: an error
// can happen before sign-in), so it answers only with a status, never with data.
// Plain JS so it runs in Node tests; scripts/build_functions.mjs bundles it with the engine into
// supabase/functions/client-error/index.ts.
//
// deps: { record({ p_app, p_role, p_message, p_stack, p_path, p_version }) → { data: 'stored'|'counted'|'limited'|'full', error } }

import { cleanReport, LIMITS, APPS } from '../../../web/engine/error_report.js';

export async function receiveError({ method, text }, deps) {
  if (method !== 'POST') return { status: 405, body: { error: 'method' } };
  if (typeof text !== 'string' || text.length > LIMITS.body) return { status: 413, body: { error: 'size' } };
  let raw = null;
  try { raw = JSON.parse(text); } catch { /* handled below */ }
  if (!raw || typeof raw !== 'object' || !APPS.includes(raw.app)) return { status: 400, body: { error: 'bad' } };
  const r = cleanReport(raw);
  if (!r) return { status: 202, body: { ok: true, result: 'ignored' } };       // noise: acknowledged, not stored
  const { data, error } = await deps.record({ p_app: r.app, p_role: r.role, p_message: r.message, p_stack: r.stack, p_path: r.path, p_version: r.version });
  if (error) return { status: 500, body: { error: 'server' } };
  if (data === 'limited') return { status: 429, body: { error: 'limited' } };
  return { status: 200, body: { ok: true, result: data } };
}
