// Speed-run reports: index.md (all personas), <key>.md (week by week), results.json (for before/after compares).
// Reports name real exercises when run on the private content, so the CLI writes them outside the repo.

import { RULES, WATCH } from './checks.mjs';
import { PATTERNS } from '../../web/engine/util.js';

const tally = (rows) => rows.reduce((m, x) => ({ ...m, [x.rule]: (m[x.rule] ?? 0) + 1 }), {});
const fmtTally = (t) => Object.entries(t).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
const lv = (levels) => PATTERNS.map((p) => `${p}${levels[p] ?? 1}`).join(' ');
const esc = (s) => String(s ?? '').replace(/\|/g, '/');

/** Compact, stable JSON for comparing runs (no engine objects, no timestamps). */
export function resultsJson(results, meta) {
  const drop = new Set(['exercise', 'written', 'setsLogged', 'checks']);
  return JSON.stringify({ meta, results }, (k, v) => (drop.has(k) ? undefined : v));
}

export function indexMd(results, meta) {
  const L = [];
  L.push('# Persona speed-run', '');
  L.push(`${results.length} personas × ${meta.weeks} weeks · content ${meta.content ?? '?'} · engine ${meta.engine ?? 'working copy'} · ran in ${meta.ms} ms`, '');
  const allV = results.flatMap((r) => r.violations.map((v) => ({ ...v, who: r.persona.name })));
  L.push(`**Framework violations: ${allV.length}**`, '');
  L.push('| Persona | Cycles | Workouts | Levels at the end | Violations | Watch items |', '|---|---|---|---|---|---|');
  for (const r of results) {
    L.push(`| [${r.persona.name}](${r.persona.key}.md) | ${r.cycles.map((c) => c.type).join(' → ')} | ${r.final.workouts} | ${lv(r.final.levels)} | ${r.violations.length} | ${fmtTally(tally(r.watch))} |`);
  }
  L.push('', '## Watch items (known gaps sprint 1 is fixing)', '', '| Item | Count | What it means |', '|---|---|---|');
  const wt = tally(results.flatMap((r) => r.watch));
  for (const [k, d] of Object.entries(WATCH)) L.push(`| ${k} | ${wt[k] ?? 0} | ${d} |`);
  L.push('', '## Violations', '');
  if (!allV.length) L.push('None.');
  else {
    L.push('| Persona | Rule | Cycle | Date | Detail |', '|---|---|---|---|---|');
    for (const v of allV) L.push(`| ${v.who} | ${v.rule}: ${RULES[v.rule] ?? ''} | ${v.cycle ?? ''} | ${v.date ?? ''} | ${esc([v.slot, v.exercise, v.detail].filter(Boolean).join(' · '))} |`);
  }
  L.push('', '## Personas', '');
  for (const r of results) L.push(`- **${r.persona.name}**: ${r.persona.story ?? ''}`);
  return L.join('\n') + '\n';
}

export function personaMd(r) {
  const p = r.persona; const L = [];
  L.push(`# ${p.name}`, '', p.story ?? '', '');
  L.push(`${p.age_band} · ${p.setup} · ${p.days} days × ${p.minutes} min · experience ${p.experience} · work-arounds ${(p.workarounds || []).join(', ') || 'none'} · restrictions ${(p.restrictions || []).join(', ') || 'none'} · floor ${p.floorOk ? 'ok' : 'no'}`, '');
  L.push(`Violations: ${r.violations.length} · Watch: ${fmtTally(tally(r.watch))}`, '');
  for (const n of r.notes) L.push(`> Week ${n.week}: ${n.text}`);
  const weeksBy = (no) => r.weeks.filter((w) => w.cycle === no);
  for (const c of r.cycles) {
    L.push('', `## Cycle ${c.no}: ${c.template.name} (${c.template.id}), starts ${c.start}`, '', `Levels: ${lv(c.levels)} · setup ${c.setup}${c.skipped ? ` · ${c.skipped} slot(s) with no option` : ''}`, '');
    for (const s of c.plan) {
      L.push(`- **${s.session} ${esc(s.name)}**: ${s.items.map((i) => `${i.slot} ${i.pattern} ${i.name ? `${esc(i.name)} L${i.level}` : '(no option)'}${i.note ? ` _(${i.note})_` : ''}`).join(' · ')}`);
    }
    for (const w of weeksBy(c.no)) L.push(...weekMd(w));
    const ups = r.levelUps.filter((u) => u.cycle === c.no);
    if (ups.length) L.push('', `**Level-ups earned this cycle (offer rule, §5.3):** ${ups.map((u) => `${esc(u.name)} (${u.pattern}) week ${u.week}`).join('; ')}`);
    if (c.review) {
      const v = c.review.validation;
      L.push('', `**Review ${c.review.date}:** adherence ${c.review.adherence}% (${c.review.completed} workouts) → next ${c.review.next}; level changes ${c.review.level_changes.map((x) => `${x.pattern} ${x.change > 0 ? '+1' : '−1'}`).join(', ') || 'none'}; swaps ${c.review.swaps.length}; validator ${v.errors.length ? `ERRORS ${v.errors.join('; ')}` : 'ok'}${v.review.length ? `; review: ${v.review.join('; ')}` : ''}`);
    }
  }
  const pv = [...r.violations, ...r.watch];
  if (pv.length) {
    L.push('', '## Violations and watch items', '', '| Kind | Rule | Cycle | When | Detail |', '|---|---|---|---|---|');
    for (const v of r.violations) L.push(`| violation | ${v.rule} | ${v.cycle ?? ''} | ${v.date ?? ''} | ${esc([v.slot, v.exercise, v.detail].filter(Boolean).join(' · '))} |`);
    for (const v of r.watch) L.push(`| watch | ${v.rule} | ${v.cycle ?? ''} | ${v.date ?? `week ${v.week}`} | ${esc([v.exercise, v.detail].filter(Boolean).join(' · '))} |`);
  }
  return L.join('\n') + '\n';
}

function weekMd(w) {
  const L = ['', `### Week ${w.g}${w.waiting ? ': waiting to start her next cycle' : ` (cycle week ${w.cw}): ${w.mode}${w.restReasons?.length ? ` (${w.restReasons.join(', ')})` : ''}`}`];
  if (w.waiting) return L;
  if (w.modeMsg) L.push(`_${w.modeMsg}_`);
  if (!w.sessions.length) L.push('No workouts.');
  for (const s of w.sessions) {
    const tags = [s.weekMode !== 'build' && s.weekMode, s.comeback !== 'none' && `comeback ${s.comeback}`, s.scaled && 'scaled',
      s.holdAndTrim && 'hold and trim', s.lighterByCheckin && 'lighter (check-ins)'].filter(Boolean);
    const ci = s.checkin;
    L.push(`- **${s.letter}** ${s.date}${tags.length ? ` [${tags.join(', ')}]` : ''} · check-in ${ci.feel}/${ci.energy}${ci.sore.length ? ` sore ${ci.soreness}: ${ci.sore.join(', ')}` : ''}${ci.areas.length ? ` · work-around ${ci.areas.join(', ')}` : ''}${ci.pain ? ` · pain ${ci.pain}` : ''}`);
    for (const sw of s.swaps) L.push(`  - swap ${sw.slot}: ${sw.from} → ${sw.to ?? 'skipped'} (${sw.area})`);
    for (const l of s.lines) {
      L.push(`  - ${l.slot} ${esc(l.name)} L${l.level}: ${l.sets}×${l.range} @${l.rir} ${l.weightLabel}${l.found ? ' (found)' : ''} → ${l.reps} ${l.rating} · ${l.action}${l.soreArea ? ` · held (sore ${l.soreArea})` : ''}`);
    }
    for (const t of s.triggered) L.push(`  - **adjustment:** ${t}`);
    for (const f of s.flagsRaised) L.push(`  - **flag:** ${f}`);
  }
  return L;
}
