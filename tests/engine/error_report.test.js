import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrub, cleanPath, isNoise, cleanReport, reportKey, LIMITS } from '../../web/engine/error_report.js';

const raw = (over = {}) => ({ app: 'patient', role: 'patient', message: 'TypeError: x is undefined', stack: 'TypeError: x\n    at f (https://example.org/app/patient/home.js?v=3:10:5)', path: '/app/', version: '2026.11.15-3', ...over });

test('scrub removes what could identify a person', () => {
  assert.equal(scrub('failed for dana@example.com'), 'failed for [email]');
  assert.equal(scrub('row 7f3c2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6 missing'), 'row [id] missing');
  assert.equal(scrub('call 555-123-4567 or (555) 123-4567'), 'call [phone] or [phone]');
  assert.equal(scrub('id 12345678 and 12 and 99999'), 'id [n] and 12 and 99999');
  assert.equal(scrub('bad token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefgh'), 'bad token [token]');
  assert.equal(scrub(`key ${'a1'.repeat(20)}`), 'key [token]');
  assert.equal(scrub('GET https://abc.supabase.co/rest/v1/patients?id=eq.5&select=* failed'), 'GET /rest/v1/patients failed', 'host and query dropped');
});

test('cleanReport: tidy, trimmed, and with the page address reduced to a path', () => {
  const r = cleanReport(raw({ message: '  TypeError:   x is   undefined\n for dana@example.com ' }));
  assert.equal(r.message, 'TypeError: x is undefined for [email]');
  assert.equal(r.stack, 'TypeError: x\nat f (/app/patient/home.js:10:5)', 'origin and query removed from the stack');
  assert.deepEqual([r.app, r.role, r.path, r.version], ['patient', 'patient', '/app/', '2026.11.15-3']);
  assert.equal(r.userId, undefined);
  assert.equal(Object.keys(r).sort().join(), 'app,message,path,role,stack,version');
});

test('cleanReport: long quoted text (something she typed) and JSON parse snippets are replaced', () => {
  assert.equal(cleanReport(raw({ message: 'Bad value "my knee has hurt since the surgery last spring"' })).message, 'Bad value [text]');
  assert.equal(cleanReport(raw({ message: 'Unexpected token \'M\', "My knee hu"... is not valid JSON' })).message, 'Unexpected token [text], [text]... is not valid JSON');
  assert.equal(cleanReport(raw({ message: "Cannot read properties of undefined (reading 'name')" })).message, "Cannot read properties of undefined (reading 'name')", 'short quoted names stay');
});

test('cleanReport: limits and shapes', () => {
  const r = cleanReport(raw({ message: 'word '.repeat(200), stack: Array.from({ length: 40 }, (_, i) => `    at fn${i} (file.js:${i}:1)`).join('\n') }));
  assert.equal(r.message.length, LIMITS.message);
  assert.equal(r.stack.split('\n').length, LIMITS.stackLines);
  assert.ok(r.stack.length <= LIMITS.stack);
  assert.equal(cleanReport(raw({ stack: '' })).stack, null);
  assert.equal(cleanReport(raw({ role: 'superuser' })).role, null, 'unknown role dropped');
  assert.equal(cleanReport(raw({ role: null })).role, null);
  assert.equal(cleanReport(raw({ version: 'x'.repeat(80) })).version, 'unknown');
  assert.equal(cleanReport(raw({ version: '1 2' })).version, 'unknown');
  for (const bad of [null, 'x', 42, {}, raw({ app: 'strength-app' }), raw({ app: undefined })]) assert.equal(cleanReport(bad), null);
});

test('cleanPath: no query, no hash, ids replaced', () => {
  assert.equal(cleanPath('/app/join.html?code=LAKESIDE#top'), '/app/join.html');
  assert.equal(cleanPath('/admin/patient/7f3c2a10-1b2c-4d5e-8f90-a1b2c3d4e5f6'), '/admin/patient/:id');
  assert.equal(cleanPath('/clinic/12345/report'), '/clinic/:n/report');
  assert.equal(cleanPath(''), '/');
  assert.equal(cleanPath('x'), '/x');
  assert.equal(cleanPath(`/${'a'.repeat(500)}`).length, LIMITS.path);
});

test('noise is not reported: network trouble, aborted requests, browser quirks, extensions', () => {
  for (const m of ['TypeError: Failed to fetch', 'TypeError: Load failed', 'AbortError: The operation was aborted.', 'ResizeObserver loop completed with undelivered notifications.',
    'Script error.', 'Non-Error promise rejection captured with value: 3', 'NetworkError when attempting to fetch resource.', '']) {
    assert.equal(cleanReport(raw({ message: m })), null, m);
  }
  assert.equal(cleanReport(raw({ stack: 'Error\n at x (chrome-extension://abcdef/content.js:1:1)' })), null, 'extension code');
  assert.ok(cleanReport(raw({ message: 'RangeError: Invalid array length' })), 'real errors pass');
});

test('reportKey: the same error is the same key', () => {
  assert.equal(reportKey(cleanReport(raw())), reportKey(cleanReport(raw())));
  assert.notEqual(reportKey(cleanReport(raw())), reportKey(cleanReport(raw({ message: 'RangeError: other' }))));
});
