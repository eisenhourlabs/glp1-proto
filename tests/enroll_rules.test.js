import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_RE, normalizeCode, checkSignup, ENROLL_ERRORS, joinLink } from '../web/shared/enroll_rules.js';

test('codes', () => {
  assert.equal(normalizeCode(' lakeside '), 'LAKESIDE');
  assert.ok(CODE_RE.test('NORTH-1'));
  assert.ok(!CODE_RE.test('ab'));
  assert.ok(!CODE_RE.test('HAS SPACE'));
});

test('checkSignup', () => {
  const ok = { name: 'Dana', email: 'dana@example.com', password: 'longenough', confirm: 'longenough' };
  assert.equal(checkSignup(ok), '');
  assert.match(checkSignup({ ...ok, name: ' ' }), /first name/);
  assert.match(checkSignup({ ...ok, email: 'dana@' }), /valid email/);
  assert.match(checkSignup({ ...ok, password: 'short', confirm: 'short' }), /8 characters/);
  assert.match(checkSignup({ ...ok, confirm: 'different' }), /match/);
  assert.match(checkSignup({ ...ok, password: 'x'.repeat(73), confirm: 'x'.repeat(73) }), /too long/);
});

test('errors and join link', () => {
  for (const k of ['code', 'email', 'password', 'name', 'exists', 'server']) assert.ok(ENROLL_ERRORS[k]);
  assert.equal(joinLink('https://example.org/app/', 'lakeside'), 'https://example.org/app/join.html?code=LAKESIDE');
  assert.equal(joinLink('https://example.org/app/admin/', 'X-1'), 'https://example.org/app/admin/join.html?code=X-1', 'caller passes the app base');
});
