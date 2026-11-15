// Static safety checks that protect the shared origin and the portability rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const webFiles = walk('web').filter((p) => /\.(js|html|css|webmanifest)$/.test(p));
const ownFiles = webFiles.filter((p) => !p.startsWith(join('web', 'vendor')));   // web/vendor: third-party, built by scripts/vendor.sh

test('service worker only touches caches with its own prefix', () => {
  const sw = read('web/sw.js');
  assert.match(sw, /const PREFIX = 'glp1proto-';/);
  assert.match(sw, /const CACHE = `\$\{PREFIX\}\$\{self\.GLP1PROTO_VERSION\}`;/);
  // every caches.delete must be guarded by startsWith(PREFIX)
  const deletes = sw.split('\n').filter((l) => l.includes('caches.delete'));
  assert.ok(deletes.length > 0);
  for (const l of deletes) assert.match(l, /startsWith\(PREFIX\)/, `unguarded delete: ${l.trim()}`);
  assert.doesNotMatch(sw, /caches\.open\((?!CACHE\))/, 'caches.open must only use CACHE');
});

test('sw.js caches every file under web/, and nothing that does not exist', () => {
  const sw = read('web/sw.js');
  const list = sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  for (const a of list) {
    if (a.endsWith('/')) { assert.doesNotThrow(() => statSync(join(ROOT, 'web', a, 'index.html')), `missing folder page ${a}`); continue; }
    assert.doesNotThrow(() => statSync(join(ROOT, 'web', a)), `missing asset ${a}`);
  }
  for (const f of walk('web').map((p) => relative('web', p).split('\\').join('/'))) {
    if (f !== 'sw.js') assert.ok(list.includes(`./${f}`), `web/${f} is not in the sw.js ASSETS list: run node scripts/sw_assets.mjs`);
  }
});

test('safe updates (C5): no skipWaiting on install, one version constant', () => {
  const sw = read('web/sw.js');
  assert.match(sw, /importScripts\('\.\/version\.js'\)/);
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.doesNotMatch(install, /skipWaiting/, 'install must not skipWaiting');
  assert.match(sw, /e\.data\?\.type === 'SKIP_WAITING'\) self\.skipWaiting\(\)/, 'only her tap applies an update');
  const v = read('web/version.js');
  assert.match(v, /^globalThis\.GLP1PROTO_VERSION = '\d{4}\.\d{2}\.\d{2}-\d+';$/m);
  assert.doesNotMatch(v, /^\s*(import|export)\b/m, 'version.js must stay a plain script (the worker loads it with importScripts)');
  assert.match(read('web/config.js'), /import '\.\/version\.js';/);
});

test('A3: nothing loads from a CDN; third-party code is self-hosted in web/vendor/', () => {
  for (const f of webFiles) assert.doesNotMatch(read(f), /cdn\.jsdelivr\.net|unpkg\.com|esm\.sh|cdnjs/, `${f} loads from a CDN`);
  assert.match(read('web/shared/supa.js'), /from '\.\.\/vendor\/supabase-js\.js'/);
  for (const v of ['supabase-js.js', 'qrcode.js']) assert.match(read(`web/vendor/${v}`), /^\/\/ \S+ [\d.]+ \(MIT/, `${v} header names its version`);
});

test('Supabase URL / key appear only in web/config.js', () => {
  for (const f of ownFiles) {
    if (f === join('web', 'config.js')) continue;
    const s = read(f);
    assert.doesNotMatch(s, /[a-z0-9]{20}\.supabase\.co/, `${f} hard-codes a Supabase project URL`);
    assert.doesNotMatch(s, /sb_publishable_|sb_secret_|eyJhbGciOi/, `${f} contains a key`);
  }
});

test('no secret keys anywhere in web/', () => {
  for (const f of ownFiles) assert.doesNotMatch(read(f), /sb_secret_|service_role/i, f);   // vendor code names key prefixes
});

test('no references to the strength app project or repo', () => {
  const strength = /mfqtlgtllocxenrekorg|strength-app\/|05_Scripts|06_App/;
  for (const f of [...webFiles, ...walk('scripts'), ...walk('supabase')]) {
    if (f.endsWith('.pyc')) continue;
    assert.doesNotMatch(read(f), strength, `${relative(ROOT, join(ROOT, f))} references the strength app`);
  }
});

test('web pages use relative URLs only (portable base path)', () => {
  for (const f of webFiles.filter((p) => p.endsWith('.html'))) {
    const s = read(f);
    for (const m of s.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const u = m[1];
      assert.ok(!u.startsWith('/'), `${f}: absolute path ${u}`);
      assert.doesNotMatch(u, /^https?:/, `${f}: external URL ${u} (self-host it in web/vendor/)`);
    }
  }
});

test('localStorage keys are namespaced through CONFIG.STORAGE_PREFIX', () => {
  for (const f of ownFiles.filter((p) => p.endsWith('.js'))) {
    const s = read(f);
    for (const m of s.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([^,)]+)/g)) {
      assert.match(m[1], /STORAGE_PREFIX|storageKey|k\(/, `${f}: un-namespaced localStorage key ${m[1]}`);
    }
  }
});
