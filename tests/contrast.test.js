// Colour contrast for the design tokens in web/shared/ui.css, light and dark (backlog C6). WCAG AA needs 4.5:1 for
// normal text. The axe scan in the browser tests covers what is on screen; this covers every token pairing, including
// the dark theme and screens the scan doesn't visit. Clinic accent colours are chosen per clinic and aren't checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/shared/ui.css', import.meta.url), 'utf8');
const block = (re) => { const m = css.match(re); assert.ok(m, `no block for ${re}`); return m[1]; };
const tokens = (text) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));

const light = tokens(block(/:root\s*\{([^}]*)\}/));
const darkAuto = tokens(block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/));
const darkSet = tokens(block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/));

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, p) => a.map((v, i) => v * p + b[i] * (1 - p));          // color-mix(in srgb, a p%, b)

function pairs(t) {
  const c = (k) => { assert.ok(t[k], `token --${k} missing`); return rgb(t[k]); };
  const tint = (k) => mix(c(k), c('surface'), 0.15);                       // .pill.good / .warn / .danger backgrounds
  return [
    ['text on page', c('text'), c('bg')], ['text on card', c('text'), c('surface')], ['text on soft card', c('text'), c('surface-2')],
    ['muted on page', c('text-muted'), c('bg')], ['muted on card', c('text-muted'), c('surface')], ['muted on soft card', c('text-muted'), c('surface-2')],
    ['brand (links) on page', c('brand'), c('bg')], ['brand on card', c('brand'), c('surface')], ['brand on soft card', c('brand'), c('surface-2')],
    ['button text on brand', c('brand-ink'), c('brand')],
    ['danger on card', c('danger'), c('surface')], ['danger on page', c('danger'), c('bg')],
    ['good on card', c('good'), c('surface')], ['good on page', c('good'), c('bg')],
    ['warn on card', c('warn'), c('surface')], ['warn on page', c('warn'), c('bg')],
    ['check mark on good', c('brand-ink'), c('good')],
    ['pill: good', c('good'), tint('good')], ['pill: warn', c('warn'), tint('warn')], ['pill: danger', c('danger'), tint('danger')],
    ['pill: muted', c('text-muted'), c('surface-2')],
  ];
}

for (const [name, t] of [['light', light], ['dark', darkSet]]) {
  test(`contrast, ${name} theme: every text and background pairing is at least 4.5:1`, () => {
    // The light theme's brand-ink is white; the dark theme overrides it. Light has no dark-only tokens.
    for (const [label, fg, bg] of pairs(t)) assert.ok(ratio(fg, bg) >= 4.5, `${name}: ${label} is ${ratio(fg, bg).toFixed(2)}:1`);
  });
}

test('the two ways of asking for the dark theme define the same colours', () => {
  assert.deepEqual(darkAuto, darkSet);
});
