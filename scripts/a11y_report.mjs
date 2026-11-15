// Summarize the accessibility scan from the browser smokes (backlog A18) and fail on serious or critical issues.
//   A11Y_REPORT=/tmp/a11y.jsonl node tests/browser/<name>.smoke.mjs ...   (each smoke appends its scans)
//   node scripts/a11y_report.mjs /tmp/a11y.jsonl
// Issues listed in tests/browser/a11y_known.json are reported but don't fail the build; they are the open list for
// backlog C6. Fix one, then remove it from that file. A new serious or critical issue fails CI.
import { readFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) { console.error(`No scan results at ${file}`); process.exit(1); }
const known = JSON.parse(readFileSync(new URL('../tests/browser/a11y_known.json', import.meta.url), 'utf8')).known || {};
const scans = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

const byRule = new Map();
for (const s of scans) {
  for (const v of s.violations) {
    const r = byRule.get(v.id) ?? { ...v, screens: new Set(), examples: new Set() };
    r.screens.add(s.label); v.nodes.forEach((n) => r.examples.add(n));
    byRule.set(v.id, r);
  }
}
console.log(`Accessibility scan: ${scans.length} screens checked, ${byRule.size} serious/critical rule(s) hit.`);
let failed = 0;
for (const [id, r] of byRule) {
  const isKnown = Object.hasOwn(known, id);
  if (!isKnown) failed++;
  console.log(`\n${isKnown ? 'KNOWN (C6)' : 'NEW'} · ${r.impact} · ${id}: ${r.help}`);
  console.log(`  screens (${r.screens.size}): ${[...r.screens].slice(0, 8).join(', ')}${r.screens.size > 8 ? ', …' : ''}`);
  console.log(`  e.g. ${[...r.examples].slice(0, 3).join(' | ')}`);
}
const fixed = Object.keys(known).filter((id) => !byRule.has(id));
if (fixed.length) console.log(`\nNo longer found (remove from a11y_known.json): ${fixed.join(', ')}`);
if (failed) { console.error(`\nFAIL: ${failed} new serious/critical accessibility issue(s).`); process.exit(1); }
console.log('\nA11Y PASSED (no new serious or critical issues)');
