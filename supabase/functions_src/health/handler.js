// Edge Function `health` (backlog A14): "is the app's backend up?" for a person or, later, an uptime monitor.
// 200 {"ok":true,"database":"up"} when the database answers, 503 {"ok":false,"database":"down"} when it doesn't.
// Says nothing else (no version, no counts, no names), so it is safe to leave public.
// Plain JS so it runs in Node tests; scripts/build_functions.mjs turns it into supabase/functions/health/index.ts.
//
// deps: { ping() → promise, rejects (or resolves { error }) when the database can't be reached, now() → Date,
//         timeoutMs (default 4000) }

export async function checkHealth(deps) {
  const timeoutMs = deps.timeoutMs ?? 4000;
  let up = false;
  try {
    const result = await Promise.race([
      Promise.resolve(deps.ping()),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    up = !result?.error;
  } catch { up = false; }
  const checked_at = deps.now().toISOString();
  return up ? { status: 200, body: { ok: true, database: 'up', checked_at } } : { status: 503, body: { ok: false, database: 'down', checked_at } };
}
