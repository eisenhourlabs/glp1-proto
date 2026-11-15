// Before/after compare of two speed-run results.json files (e.g. main vs a pull request's branch).
// The report for Amanda: what each persona's plan, levels, doses and watch items look like before and after.

import { PATTERNS } from '../../web/engine/util.js';

const tally = (rows) => rows.reduce((m, x) => ({ ...m, [x.rule]: (m[x.rule] ?? 0) + 1 }), {});
const esc = (s) => String(s ?? '').replace(/\|/g, '/');
const pick = (i) => (i.name ? `${i.name} L${i.level}` : '(no option)');
const lineKey = (w, s, l) => `${w.g}|${s.letter}|${l.slot}`;
const lineText = (l) => `${l.name} ${l.sets}×${l.range} ${l.weightLabel}`.trim();

/** Markdown comparing before → after. `limit` caps the example rows per persona. */
export function compareMd(before, after, { limit = 12 } = {}) {
  const L = ['# Speed-run: before and after', ''];
  L.push(`Before: ${before.meta.engine ?? '?'} · After: ${after.meta.engine ?? '?'} · ${after.meta.weeks} weeks · content ${after.meta.content ?? '?'}`, '');
  const b = Object.fromEntries(before.results.map((r) => [r.persona.key, r]));
  L.push('| Persona | Workouts | Cycles | Plan picks changed | Session lines changed | Violations | Watch items |', '|---|---|---|---|---|---|---|');
  const detail = [];
  for (const a of after.results) {
    const o = b[a.persona.key];
    if (!o) { L.push(`| ${a.persona.name} | new persona | | | | | |`); continue; }
    const picks = planChanges(o, a);
    const lines = lineChanges(o, a);
    const tw = (r) => tally(r.watch);
    const watchKeys = [...new Set([...Object.keys(tw(o)), ...Object.keys(tw(a))])];
    L.push(`| ${a.persona.name} | ${o.final.workouts} → ${a.final.workouts} | ${o.cycles.map((c) => c.type).join(' ')} → ${a.cycles.map((c) => c.type).join(' ')} | ${picks.length} | ${lines.length} | ${o.violations.length} → ${a.violations.length} | ${watchKeys.map((k) => `${k} ${tw(o)[k] ?? 0} → ${tw(a)[k] ?? 0}`).join(', ') || 'none'} |`);
    const D = [`## ${a.persona.name}`, ''];
    const levelDiff = PATTERNS.filter((p) => (o.final.levels[p] ?? 1) !== (a.final.levels[p] ?? 1));
    D.push(`Levels at the end: ${levelDiff.length ? levelDiff.map((p) => `${p} ${o.final.levels[p] ?? 1} → ${a.final.levels[p] ?? 1}`).join(', ') : 'unchanged'}`);
    for (const [i, c] of a.cycles.entries()) {
      const oc = o.cycles[i];
      const lc = (x) => x?.review?.level_changes?.map((y) => `${y.pattern} ${y.change > 0 ? '+1' : '−1'}`).join(', ') || 'none';
      if (oc?.review || c.review) if (lc(oc) !== lc(c)) D.push(`Cycle ${c.no} review level changes: ${lc(oc)} → ${lc(c)}`);
    }
    if (picks.length) {
      D.push('', '| Cycle | Session | Slot | Before | After |', '|---|---|---|---|---|');
      for (const x of picks.slice(0, limit * 2)) D.push(`| ${x.cycle} | ${x.session} | ${x.slot} ${x.pattern} | ${esc(x.before)} | ${esc(x.after)} |`);
      if (picks.length > limit * 2) D.push(`| … | | | ${picks.length - limit * 2} more | |`);
    }
    if (lines.length) {
      D.push('', 'First session lines that differ:', '', '| Week | Session | Slot | Before | After |', '|---|---|---|---|---|');
      for (const x of lines.slice(0, limit)) D.push(`| ${x.g} | ${x.session} | ${x.slot} | ${esc(x.before)} | ${esc(x.after)} |`);
      if (lines.length > limit) D.push(`| … | | | ${lines.length - limit} more | |`);
    }
    if (picks.length || lines.length || levelDiff.length) detail.push(...D, '');
  }
  L.push('', ...(detail.length ? detail : ['No differences.']));
  return L.join('\n') + '\n';
}

/** Exercise picks per cycle/session/slot that differ. */
export function planChanges(o, a) {
  const out = [];
  for (const c of a.cycles) {
    const oc = o.cycles.find((x) => x.no === c.no);
    if (!oc) continue;
    for (const s of c.plan) {
      const os = oc.plan.find((x) => x.session === s.session);
      for (const it of s.items) {
        const oi = os?.items.find((x) => x.slot === it.slot);
        if (!oi || oi.id !== it.id) out.push({ cycle: c.no, session: s.session, slot: it.slot, pattern: it.pattern, before: oi ? pick(oi) : '—', after: pick(it) });
      }
    }
  }
  return out;
}

/** Session lines (week, session, slot) whose exercise, sets, range or weight differ. */
export function lineChanges(o, a) {
  const old = new Map();
  for (const w of o.weeks) for (const s of w.sessions || []) for (const l of s.lines) old.set(lineKey(w, s, l), l);
  const out = [];
  for (const w of a.weeks) for (const s of w.sessions || []) for (const l of s.lines) {
    const k = lineKey(w, s, l); const ol = old.get(k);
    if (!ol || lineText(ol) !== lineText(l)) out.push({ g: w.g, session: s.letter, slot: l.slot, before: ol ? lineText(ol) : '—', after: lineText(l) });
    old.delete(k);
  }
  for (const [k, ol] of old) { const [g, session, slot] = k.split('|'); out.push({ g: Number(g), session, slot, before: lineText(ol), after: '—' }); }
  return out.sort((x, y) => x.g - y.g);
}
