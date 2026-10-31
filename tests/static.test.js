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

test('service worker only touches caches with its own prefix', () => {
  const sw = read('web/sw.js');
  assert.match(sw, /const PREFIX = 'glp1proto-';/);
  assert.match(sw, /const CACHE = `\$\{PREFIX\}v\d+`;/);
  // every caches.delete must be guarded by startsWith(PREFIX)
  const deletes = sw.split('\n').filter((l) => l.includes('caches.delete'));
  assert.ok(deletes.length > 0);
  for (const l of deletes) assert.match(l, /startsWith\(PREFIX\)/, `unguarded delete: ${l.trim()}`);
  assert.doesNotMatch(sw, /caches\.open\((?!CACHE\))/, 'caches.open must only use CACHE');
});

test('every cached asset listed in sw.js exists', () => {
  const sw = read('web/sw.js');
  const list = sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1];
  for (const a of list.match(/'([^']+)'/g).map((s) => s.slice(1, -1))) {
    if (a === './') continue;
    assert.doesNotThrow(() => statSync(join(ROOT, 'web', a)), `missing asset ${a}`);
  }
});

test('Supabase URL / key appear only in web/config.js', () => {
  for (const f of webFiles) {
    if (f === join('web', 'config.js')) continue;
    const s = read(f);
    assert.doesNotMatch(s, /[a-z0-9]{20}\.supabase\.co/, `${f} hard-codes a Supabase project URL`);
    assert.doesNotMatch(s, /sb_publishable_|sb_secret_|eyJhbGciOi/, `${f} contains a key`);
  }
});

test('no secret keys anywhere in web/', () => {
  for (const f of webFiles) assert.doesNotMatch(read(f), /sb_secret_|service_role/i, f);
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
      if (/^https?:/.test(u)) assert.match(u, /^https:\/\/cdn\.jsdelivr\.net\//, `${f}: unexpected external URL ${u}`);
    }
  }
});

test('localStorage keys are namespaced through CONFIG.STORAGE_PREFIX', () => {
  for (const f of webFiles.filter((p) => p.endsWith('.js'))) {
    const s = read(f);
    for (const m of s.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([^,)]+)/g)) {
      assert.match(m[1], /STORAGE_PREFIX|storageKey|k\(/, `${f}: un-namespaced localStorage key ${m[1]}`);
    }
  }
});
