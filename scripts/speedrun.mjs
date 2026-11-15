// Persona speed-run (backlog E1): made-up patients through the real engine, no database.
//
//   node scripts/speedrun.mjs --personas <personas.json> --content <content.json> --weeks 30 --out <folder>
//        [--compare <earlier results.json>] [--engine <label, e.g. a branch name>]
//
// content.json comes from `python scripts/export_content_json.py --file <workbook> --out <content.json>`.
// Writes <out>/index.md, <out>/<persona>.md, <out>/results.json and, with --compare, <out>/compare.md.
// Reports name real exercises, so <out> must be outside this repo (the private content folder). Exit code 1 if
// any Framework violation is found. See docs/speedrun.md.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute, join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAll } from './speedrun/run.mjs';
import { indexMd, personaMd, resultsJson } from './speedrun/report.mjs';
import { compareMd } from './speedrun/compare.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

/** Personas file: { personas: [...] } or [...]. Older review files used `band` for the age band. */
export function loadPersonas(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.personas;
  if (!Array.isArray(list) || !list.length) throw new Error(`${file}: no personas`);
  return list.map((p) => ({ ...p, age_band: p.age_band ?? p.band }));
}

export function insideRepo(dir) {
  const rel = relative(REPO, resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function main() {
  const a = args(process.argv.slice(2));
  if (!a.personas || !a.content || !a.out) {
    console.error('usage: node scripts/speedrun.mjs --personas <file> --content <content.json> --weeks 30 --out <folder> [--compare <results.json>] [--engine <label>]');
    process.exit(2);
  }
  if (insideRepo(a.out) && !a['allow-repo-out']) {
    console.error('--out must be outside the repo: the reports name real exercises from the private content.');
    process.exit(2);
  }
  const weeks = Number(a.weeks ?? 30);
  const content = JSON.parse(readFileSync(a.content, 'utf8'));
  const personas = loadPersonas(a.personas);
  const { results, ms } = runAll(personas, content, { weeks, now: () => performance.now() });
  const meta = { weeks, ms: Math.round(ms), content: basename(a.content), engine: a.engine ?? null, personas: personas.length };
  mkdirSync(a.out, { recursive: true });
  writeFileSync(join(a.out, 'index.md'), indexMd(results, meta));
  for (const r of results) writeFileSync(join(a.out, `${r.persona.key}.md`), personaMd(r));
  writeFileSync(join(a.out, 'results.json'), resultsJson(results, meta));
  if (a.compare) {
    if (!existsSync(a.compare)) throw new Error(`--compare: ${a.compare} not found`);
    const before = JSON.parse(readFileSync(a.compare, 'utf8'));
    const after = JSON.parse(resultsJson(results, meta));
    writeFileSync(join(a.out, 'compare.md'), compareMd(before, after));
  }
  const v = results.reduce((n, r) => n + r.violations.length, 0);
  const w = results.reduce((n, r) => n + r.watch.length, 0);
  console.log(`${personas.length} personas × ${weeks} weeks in ${meta.ms} ms · violations ${v} · watch items ${w} · reports in ${resolve(a.out)}`);
  if (v) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
