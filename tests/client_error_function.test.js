// Edge Functions client-error and health (backlog A14): handler behaviour, the generated files are current and run on
// their own, and every app installs error capture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, outPath } from '../scripts/build_functions.mjs';
import { receiveError } from '../supabase/functions_src/client-error/handler.js';
import { checkHealth } from '../supabase/functions_src/health/handler.js';
import { CONFIG } from '../web/config.js';

const body = (o = {}) => JSON.stringify({ app: 'patient', role: 'patient', message: 'TypeError: x is undefined', stack: 'at f (home.js:1:1)', path: '/', version: '2026.11.15-3', ...o });
const recorder = (result = 'stored', error = null) => { const calls = []; return { calls, record: async (a) => { calls.push(a); return { data: result, error }; } }; };

test('client-error: a good report is cleaned and stored', async () => {
  const d = recorder();
  const r = await receiveError({ method: 'POST', text: body({ message: 'failed for dana@example.com', path: '/join.html?code=ABC' }) }, d);
  assert.deepEqual([r.status, r.body], [200, { ok: true, result: 'stored' }]);
  assert.deepEqual(d.calls[0], { p_app: 'patient', p_role: 'patient', p_message: 'failed for [email]', p_stack: 'at f (home.js:1:1)', p_path: '/join.html', p_version: '2026.11.15-3' });
  assert.ok(!JSON.stringify(d.calls).includes('dana@'), 'nothing identifying reaches the database');
});

test('client-error: bad requests are refused and store nothing', async () => {
  const d = recorder();
  assert.equal((await receiveError({ method: 'GET', text: '' }, d)).status, 405);
  assert.equal((await receiveError({ method: 'POST', text: 'not json' }, d)).status, 400);
  assert.equal((await receiveError({ method: 'POST', text: body({ app: 'strength-app' }) }, d)).status, 400);
  assert.equal((await receiveError({ method: 'POST', text: '[]' }, d)).status, 400);
  assert.equal((await receiveError({ method: 'POST', text: 'x'.repeat(9000) }, d)).status, 413);
  assert.equal(d.calls.length, 0);
});

test('client-error: noise is acknowledged but not stored; limits and failures map to statuses', async () => {
  const d = recorder();
  const noise = await receiveError({ method: 'POST', text: body({ message: 'TypeError: Failed to fetch' }) }, d);
  assert.deepEqual([noise.status, noise.body.result, d.calls.length], [202, 'ignored', 0]);
  assert.equal((await receiveError({ method: 'POST', text: body() }, recorder('counted'))).body.result, 'counted');
  assert.equal((await receiveError({ method: 'POST', text: body() }, recorder('limited'))).status, 429);
  const down = await receiveError({ method: 'POST', text: body() }, recorder(null, { message: 'db down: secret detail' }));
  assert.deepEqual([down.status, down.body], [500, { error: 'server' }], 'no database detail leaks');
});

test('health: up, down, an error result, and a hang', async () => {
  const now = () => new Date('2026-11-15T12:00:00Z');
  const up = await checkHealth({ now, ping: async () => ({ data: [], error: null }) });
  assert.deepEqual([up.status, up.body], [200, { ok: true, database: 'up', checked_at: '2026-11-15T12:00:00.000Z' }]);
  assert.equal((await checkHealth({ now, ping: async () => ({ data: null, error: { message: 'x' } }) })).status, 503);
  assert.equal((await checkHealth({ now, ping: async () => { throw new Error('connection refused'); } })).status, 503);
  const slow = await checkHealth({ now, timeoutMs: 20, ping: () => new Promise(() => {}) });
  assert.deepEqual([slow.status, slow.body.database], [503, 'down']);
  assert.deepEqual(Object.keys(up.body).sort(), ['checked_at', 'database', 'ok'], 'says nothing else');
});

test('the generated functions are current and the bundled code runs on its own', async () => {
  for (const name of ['client-error', 'health']) assert.equal(readFileSync(outPath(name), 'utf8'), build(name), `${name} is stale (run node scripts/build_functions.mjs)`);
  const grab = (name) => { const t = readFileSync(outPath(name), 'utf8'); return t.slice(t.indexOf('// ════ Engine and handler'), t.indexOf('// ════ end of generated code')); };
  const ce = await import(`data:text/javascript,${encodeURIComponent(`${grab('client-error')}\nexport { receiveError };`)}`);
  const calls = [];
  const r = await ce.receiveError({ method: 'POST', text: body({ message: 'boom 123456789' }) }, { record: async (a) => { calls.push(a); return { data: 'stored', error: null }; } });
  assert.equal(r.status, 200);
  assert.equal(calls[0].p_message, 'boom [n]');
  const h = await import(`data:text/javascript,${encodeURIComponent(`${grab('health')}\nexport { checkHealth };`)}`);
  assert.equal((await h.checkHealth({ now: () => new Date(0), ping: async () => ({}) })).status, 200);
});

test('the generated files tell Troy how to deploy and mention Verify JWT', () => {
  for (const name of ['client-error', 'health']) {
    const t = readFileSync(outPath(name), 'utf8');
    assert.match(t, /Deploy a new function/); assert.match(t, /Verify JWT/); assert.match(t, new RegExp(`name it \`${name}\``));
    assert.ok(!/service_role|sb_secret|sb_publishable/i.test(t.replace(/SUPABASE_SERVICE_ROLE_KEY/g, '')), 'no keys in the file');
  }
});

test('every app installs error capture, and it can be switched off in config', () => {
  const read = (p) => readFileSync(new URL(`../web/${p}`, import.meta.url), 'utf8');
  for (const [file, app] of [['patient/main.js', 'patient'], ['admin/main.js', 'admin'], ['clinic/main.js', 'clinic']]) assert.match(read(file), new RegExp(`app: '${app}'`), `${file} names its app`);
  assert.match(read('shared/shell.js'), /installErrorReporting\(app\)/);
  assert.match(read('shared/shell.js'), /setErrorRole\(profile\.role\)/);
  assert.match(read('join.js'), /installErrorReporting\('join'\)/);
  assert.equal(typeof CONFIG.ERROR_REPORTING, 'boolean');
});
