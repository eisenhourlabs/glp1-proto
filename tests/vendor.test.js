// The self-hosted third-party scripts (A3) load and expose what the app uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('vendored supabase-js creates a client with auth, from() and rpc()', async () => {
  const { createClient } = await import('../web/vendor/supabase-js.js');
  const db = createClient('https://example.supabase.co', 'sb_publishable_example', { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal(typeof db.from, 'function');
  assert.equal(typeof db.rpc, 'function');
  assert.equal(typeof db.auth.signInWithPassword, 'function');
  assert.equal(typeof db.functions.invoke, 'function');
});

test('vendored qrcode-generator draws a code', async () => {
  const { default: qrcode } = await import('../web/vendor/qrcode.js');
  const qr = qrcode(0, 'M');
  qr.addData('https://example.org/join.html?code=TEST');
  qr.make();
  assert.ok(qr.getModuleCount() >= 21);
  assert.equal(typeof qr.isDark(0, 0), 'boolean');
});
