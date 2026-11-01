// The demo dataset generator (scripts/demo_data.mjs) on a small synthetic content set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDemo } from '../scripts/demo_data.mjs';
import { crowd, LOGIN_PERSONAS, rng } from '../scripts/demo/personas.mjs';
import { LIBRARY, slot, GYM, MINIMAL } from './engine/fixtures.js';

const sessions = (n) => ['A', 'B', 'C', 'D'].slice(0, n).map((s) => ({ session: s, name: `Full body ${s}` }));
const templates = [];
const slots = [];
for (const type of ['C1', 'C2', 'C3']) {
  for (const days of [2, 3, 4]) {
    const id = `${type}-${days}D`;
    templates.push({ template_id: id, cycle_type: type, days_per_week: days, name: `${type} ${days}`, sessions: sessions(days), active: true });
    for (const s of sessions(days)) {
      ['SQ', 'HP', 'VR', 'HI'].forEach((p, i) => slots.push({ ...slot(p, { session: s.session, slot: `P${i + 1}`, ord: i + 1, role: i < 2 ? 'P' : 'S' }), template_id: id }));
    }
  }
}
const CONTENT = { library: LIBRARY, templates, slots, settings: {},
  setups: [{ setup: 'commercial_gym', equipment: GYM }, { setup: 'barbell_gym', equipment: GYM }, { setup: 'home_gym', equipment: MINIMAL }, { setup: 'minimal_home', equipment: MINIMAL }] };

test('personas: deterministic crowd, invented names, the three login personas', () => {
  assert.deepEqual(crowd(), crowd(), 'same seed, same crowd');
  assert.equal(crowd().length, 27);
  assert.deepEqual(LOGIN_PERSONAS.map((p) => p.login), ['dana', 'maria', 'lisa']);
  const r = rng(1); const a = r(); assert.ok(a >= 0 && a < 1);
});

test('buildDemo: consistent, relative, deterministic', () => {
  const demo = buildDemo(CONTENT);
  assert.deepEqual(buildDemo(CONTENT), demo, 'deterministic');
  assert.equal(demo.personas.length, 30);
  for (const p of demo.personas) {
    const refs = new Set(p.session_logs.map((l) => l.ref));
    assert.ok(p.session_logs.every((l) => l.day <= 0), `${p.key}: no future sessions`);
    assert.ok(p.exercise_logs.every((e) => refs.has(e.log_ref)), `${p.key}: exercise logs point at sessions`);
    assert.ok(p.session_logs.every((l) => l.status !== 'done' || l.session), `${p.key}: done sessions name their workout`);
    assert.equal(p.cycles.filter((c) => c.status === 'active').length, p.cycles.length ? 1 : 0, `${p.key}: one active cycle`);
    for (const r of p.proposals) assert.ok(p.cycles.some((c) => c.cycle_no === r.applied_cycle_no), `${p.key}: review applied to a real cycle`);
  }
  const dana = demo.personas.find((p) => p.login === 'dana');
  assert.equal(dana.cycles.length, 1, 'Dana is in week 9 of her first cycle');
  assert.equal(dana.proposals.length, 0, 'her review is still to do');
  assert.equal(Math.floor(-dana.cycles[0].start_day / 7) + 1, 9);
  const lisa = demo.personas.find((p) => p.login === 'lisa');
  const lastLisa = Math.max(...lisa.session_logs.filter((l) => l.status === 'done').map((l) => l.day));
  assert.ok(lastLisa <= -8, 'Lisa is due a welcome-back session');
  assert.ok(lisa.session_logs.some((l) => l.skip_reason === 'travel'));
  const veterans = demo.personas.filter((p) => p.cycles.length === 2);
  assert.ok(veterans.length >= 3, 'some patients are in their second cycle');
  assert.ok(veterans.every((p) => p.proposals.length === 1 && p.cycles[1].cycle_type === 'C2'));
  const onboarding = demo.personas.find((p) => p.patient.status === 'onboarding');
  assert.equal(onboarding.documents.length + onboarding.session_logs.length, 0);
  const paused = demo.personas.find((p) => p.patient.status === 'paused');
  assert.ok(paused.flags.some((f) => f.type === 'screening') && paused.start_day === null);
  assert.ok(demo.staff.some((s) => s.role === 'clinic_viewer') && demo.staff.some((s) => s.role === 'admin'));
});
