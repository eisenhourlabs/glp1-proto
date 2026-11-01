// Build paste-ready Edge Functions that reuse the engine (no bundler dependency, no build step for the web app).
//
//   node scripts/build_functions.mjs          # write supabase/functions/<name>/index.ts for each folder in functions_src
//   node scripts/build_functions.mjs --check  # exit 1 if a committed file is out of date (tests/functions_build.test.js)
//
// Each engine module is wrapped in its own scope (`const __review = (() => { …; return { … }; })();`) so names like
// DEFAULTS can't collide; its relative imports become destructuring from the dependency's scope. The handler is
// treated the same way, and deno.ts provides the Deno.serve wrapper with a /*__BUNDLE__*/ placeholder.
// Supports the engine's own style only: named imports from relative paths, `export function|const|async function`.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'supabase', 'functions_src');
const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*'(\.[^']+)';?\s*$/gm;

const scopeName = (file) => `__${basename(file, '.js').replace(/[^A-Za-z0-9]/g, '_')}`;

function parse(file) {
  const code = readFileSync(file, 'utf8');
  const deps = [];
  for (const m of code.matchAll(IMPORT_RE)) deps.push({ names: m[1], file: resolve(dirname(file), m[2]) });
  if (/^\s*import\s/m.test(code.replace(IMPORT_RE, ''))) throw new Error(`${relative(ROOT, file)}: unsupported import form`);
  if (/^export\s+(default|\{|\*)/m.test(code)) throw new Error(`${relative(ROOT, file)}: unsupported export form`);
  const exports = [...code.matchAll(/^export\s+(?:async\s+)?(?:function\s*\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  return { file, code, deps, exports };
}

/** Modules in dependency order (dependencies first). */
function collect(entry) {
  const order = []; const seen = new Set();
  const visit = (file, stack = []) => {
    if (seen.has(file)) return;
    if (stack.includes(file)) throw new Error(`import cycle: ${[...stack, file].map((f) => relative(ROOT, f)).join(' → ')}`);
    const mod = parse(file);
    for (const d of mod.deps) visit(d.file, [...stack, file]);
    seen.add(file); order.push(mod);
  };
  visit(entry);
  return order;
}

function transform(mod) {
  let body = mod.code.replace(IMPORT_RE, (_, names, path) => {
    const fields = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': ')).join(', ');
    return `const { ${fields} } = ${scopeName(resolve(dirname(mod.file), path))};`;
  });
  body = body.replace(/^export\s+/gm, '');
  return `// ── ${relative(ROOT, mod.file)} ──\nconst ${scopeName(mod.file)} = (() => {\n${body.trimEnd()}\nreturn { ${mod.exports.join(', ')} };\n})();\n`;
}

export function build(name) {
  const dir = join(SRC, name);
  const modules = collect(join(dir, 'handler.js'));
  const handler = modules[modules.length - 1];
  const bundle = modules.map(transform).join('\n')
    + `const { ${handler.exports.join(', ')} } = ${scopeName(handler.file)};\n`;
  const wrapper = readFileSync(join(dir, 'deno.ts'), 'utf8');
  if (!wrapper.includes('/*__BUNDLE__*/')) throw new Error(`${name}/deno.ts has no /*__BUNDLE__*/ placeholder`);
  return wrapper.replace('/*__BUNDLE__*/', `// ════ Engine and handler (generated; do not edit here) ════\n${bundle}// ════ end of generated code ════`);
}

export const functionNames = () => (existsSync(SRC) ? readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);
export const outPath = (name) => join(ROOT, 'supabase', 'functions', name, 'index.ts');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const name of functionNames()) {
    const out = build(name);
    const path = outPath(name);
    if (check) {
      const same = existsSync(path) && readFileSync(path, 'utf8') === out;
      if (!same) { stale += 1; console.error(`out of date: ${relative(ROOT, path)} (run node scripts/build_functions.mjs)`); }
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, out);
      console.log(`wrote ${relative(ROOT, path)} (${out.split('\n').length} lines)`);
    }
  }
  if (stale) process.exit(1);
}
