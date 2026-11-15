// Static accessibility rules (backlog C6) that need no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../web/${p}`, import.meta.url), 'utf8');

test('no page wraps the whole app in an aria-live region', () => {
  for (const page of ['index.html', 'join.html', 'admin/index.html', 'clinic/index.html']) {
    const main = read(page).match(/<main\b[^>]*>/)?.[0] ?? '';
    assert.ok(main, `${page} has a <main>`);
    assert.ok(!/aria-live/.test(main), `${page}: <main> must not be aria-live (status lines use role="status")`);
  }
});

test('every page declares its language and a viewport that allows zoom', () => {
  for (const page of ['index.html', 'join.html', 'admin/index.html', 'clinic/index.html']) {
    const html = read(page);
    assert.match(html, /<html lang="en"/, `${page}: lang`);
    assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(html), `${page}: pinch-zoom must stay on`);
  }
});

test('status helpers announce politely', () => {
  assert.match(read('shared/ui.js'), /statusLine = \(\) => h\('p', \{ class: 'form-msg', role: 'status' \}\)/);
});
