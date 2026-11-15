// Rewrite the ASSETS list in web/sw.js from the files under web/ (every file except sw.js, plus the folder pages).
//   node scripts/sw_assets.mjs
// Run it after adding, renaming or deleting a file under web/; tests/static.test.js fails until the list matches.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB = new URL('../web/', import.meta.url).pathname;
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
const files = walk(WEB).map((p) => relative(WEB, p).split('\\').join('/')).filter((f) => f !== 'sw.js')
  .sort((a, b) => (a.includes('/') - b.includes('/')) || (a < b ? -1 : 1));
const folders = [...new Set(files.filter((f) => f.endsWith('/index.html') && f.includes('/')).map((f) => f.slice(0, -'index.html'.length)))];
const list = ['./', ...folders.map((f) => `./${f}`), ...files.map((f) => `./${f}`)].filter((f) => f === './' || !f.endsWith('/') || existsSync(join(WEB, f, 'index.html')));
const sw = readFileSync(join(WEB, 'sw.js'), 'utf8');
const next = sw.replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [\n${list.map((a) => `  '${a}',`).join('\n')}\n];`);
writeFileSync(join(WEB, 'sw.js'), next);
console.log(`sw.js ASSETS: ${list.length} entries${next === sw ? ' (unchanged)' : ' (updated)'}`);
