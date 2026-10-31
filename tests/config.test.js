import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../web/config.js';

test('config has every required key', () => {
  for (const k of ['ENV', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'BRAND_NAME', 'STORAGE_PREFIX', 'DEMO_BANNER']) {
    assert.ok(k in CONFIG, `missing CONFIG.${k}`);
  }
  assert.equal(CONFIG.STORAGE_PREFIX, 'glp1proto');
  assert.ok(Object.isFrozen(CONFIG));
});

test('prototype deployments always show the demo banner', () => {
  if (CONFIG.ENV === 'prototype') assert.equal(CONFIG.DEMO_BANNER, true);
});

test('config URL, when set, is an https Supabase URL', () => {
  if (!CONFIG.SUPABASE_URL.includes('REPLACE_ME')) {
    assert.match(CONFIG.SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  }
});
