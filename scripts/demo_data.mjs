// Build the demo dataset (Phase 6) from the private content export, with the real engine.
//   node scripts/demo_data.mjs <content.json> <out.json>
// The output names exercise ids from the private library, so write it OUTSIDE this repo (e.g. the content folder as
// demo_seed.local.json). scripts/demo.py loads it; dates are stored as day offsets and anchored to the seed day.
import { readFileSync, writeFileSync } from 'node:fs';
import { LOGIN_PERSONAS, crowd } from './demo/personas.mjs';
import { simulatePersona } from './demo/simulate.mjs';

export const ANCHOR = '2026-11-02';            // any Monday; only the offsets are stored

export function buildDemo(content) {
  const personas = [...LOGIN_PERSONAS, ...crowd()].map((p) => simulatePersona(p, content, { anchor: ANCHOR }));
  return {
    format: 1,
    clinic: { name: 'Lakeside Weight & Wellness', short_name: 'Lakeside', accent_color: '#6b4fa0', code: 'LAKESIDE' },
    staff: [
      { login: 'frontdesk', name: 'Lakeside front desk', role: 'clinic_viewer' },
      { login: 'brad', name: 'Brad (demo admin)', role: 'admin' },
    ],
    personas,
  };
}

if (process.argv[1]?.endsWith('demo_data.mjs')) {
  const [, , input, output] = process.argv;
  if (!input || !output) { console.error('usage: node scripts/demo_data.mjs <content.json> <out.json>'); process.exit(2); }
  const demo = buildDemo(JSON.parse(readFileSync(input, 'utf8')));
  writeFileSync(output, JSON.stringify(demo));
  const n = (k) => demo.personas.reduce((s, p) => s + p[k].length, 0);
  console.log(`wrote ${output}: ${demo.personas.length} patients, ${n('session_logs')} session logs, ${n('exercise_logs')} exercise logs, `
    + `${n('flags')} flags, ${n('adjustments')} adjustments, ${n('proposals')} reviews`);
}
