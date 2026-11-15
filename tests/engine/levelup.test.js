// B1: automatic level-ups at the cycle review (Amanda packet Q4), ceilings, and her "Keep it where it was" choice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewLevelUps, LEVELUP_DEFAULTS } from '../../web/engine/levels.js';
import { cycleSummary, defaultProposal, levelCeilings, applyLevelChoices, patternName, reviewProfile } from '../../web/engine/review.js';
import { validateProposal } from '../../web/engine/review_validate.js';
import { LIBRARY, GYM, MINIMAL } from './fixtures.js';

// A summary shaped like cycleSummary's, with only what the rule reads.
const pat = (o = {}) => ({ level: 2, sessions: 8, ratings: { good: 6, easy: 1, hard: 1 }, areas: ['knees', 'hips'], ...o });
const S = (o = {}) => ({
  patient: { age_band: '50-59' },
  adherence: { pct: 90 },
  checkins: { count: 24, feel: { right: 22, too_hard: 2 }, workarounds: {}, sore_a_lot: {}, pain_areas: {}, ...(o.checkins || {}) },
  patterns: o.patterns ?? { SQ: pat() },
  ...(o.adherence ? { adherence: o.adherence } : {}),
  ...(o.patient ? { patient: o.patient } : {}),
});
const up = (s, opts) => reviewLevelUps(s, opts).changes.map((c) => c.pattern);
const why = (s, opts) => Object.fromEntries(reviewLevelUps(s, opts).held.map((h) => [h.pattern, h.reason]));

test('B1: a pattern moves up one level when every condition holds, with evidence', () => {
  const r = reviewLevelUps(S());
  assert.deepEqual(r.changes.map((c) => [c.pattern, c.change]), [['SQ', 1]]);
  assert.match(r.changes[0].evidence, /trained it 8 times, rated it Good or Easy 7 of 8 times, and did 90%/);
});

test('B1 thresholds: adherence, sessions, ratings', () => {
  assert.equal(why(S({ adherence: { pct: 74 } })).SQ, 'adherence');
  assert.deepEqual(up(S({ adherence: { pct: 75 } })), ['SQ'], '75% is enough');
  assert.equal(why(S({ patterns: { SQ: pat({ sessions: 5 }) } })).SQ, 'sessions');
  assert.deepEqual(up(S({ patterns: { SQ: pat({ sessions: 6 }) } })), ['SQ']);
  assert.equal(why(S({ patterns: { SQ: pat({ ratings: { good: 2, easy: 1, hard: 3 } }) } })).SQ, 'ratings', 'half is not most');
  assert.equal(why(S({ patterns: { SQ: pat({ ratings: {} }) } })).SQ, 'ratings');
});

test('B1: pain on an area the pattern loads holds it; elsewhere does not', () => {
  assert.equal(why(S({ checkins: { pain_areas: { knees: 1 } } })).SQ, 'pain');
  assert.deepEqual(up(S({ checkins: { pain_areas: { shoulders: 1 } } })), ['SQ']);
});

test('B1: fewer than 2 work-around or "sore a lot" reports on its areas', () => {
  assert.deepEqual(up(S({ checkins: { workarounds: { knees: 1 } } })), ['SQ']);
  assert.equal(why(S({ checkins: { workarounds: { knees: 1 }, sore_a_lot: { hips: 1 } } })).SQ, 'area_reports');
  assert.deepEqual(up(S({ checkins: { workarounds: { shoulders: 5 } } })), ['SQ'], 'not an area squats load');
});

test('B1: ≥ 40% "too hard" check-ins hold every level-up', () => {
  const s = S({ checkins: { count: 10, feel: { too_hard: 4, right: 6 } }, patterns: { SQ: pat(), HP: pat() } });
  assert.deepEqual(up(s), []);
  assert.deepEqual(why(s), { SQ: 'too_hard_cycle', HP: 'too_hard_cycle' });
  assert.deepEqual(up(S({ checkins: { count: 10, feel: { too_hard: 3, right: 7 } } })), ['SQ'], '30% is fine');
});

test('B1: never above the ceiling or the 70+ cap; +1 at most', () => {
  assert.equal(why(S({ patterns: { SQ: pat({ level: 3 }) } }), { ceilings: { SQ: 3 } }).SQ, 'ceiling');
  assert.equal(why(S({ patterns: { SQ: pat({ level: 4 }) } })).SQ, 'ceiling');
  assert.equal(why(S({ patient: { age_band: '70+' }, patterns: { SQ: pat({ level: 2 }) } })).SQ, 'ceiling');
  assert.deepEqual(up(S({ patient: { age_band: '70+' }, patterns: { SQ: pat({ level: 1 }) } })), ['SQ']);
  assert.ok(reviewLevelUps(S()).changes.every((c) => c.change === 1));
});

test('B1: settings override the defaults', () => {
  assert.equal(LEVELUP_DEFAULTS['levelup.min_sessions'], 6);
  assert.equal(why(S(), { settings: { 'levelup.min_sessions': 10 } }).SQ, 'sessions');
  assert.equal(why(S(), { settings: { 'levelup.min_adherence_pct': 95 } }).SQ, 'adherence');
});

// ── Through the real summary ──
const patient = { age_band: '40-49', experience: 'none', setup: 'commercial_gym', equipment: GYM, restrictions: [], workarounds: [],
  floor_ok: false, pattern_levels: { SQ: 2, HP: 1 }, days_per_week: 3 };
const cycle = { cycle_no: 1, cycle_type: 'C1', template_id: 'T', session_minutes: 45, week_modes: {} };
const logs = Array.from({ length: 27 }, (_, i) => ({ id: i + 1, week: Math.floor(i / 3) + 1, session: 'ABC'[i % 3], status: 'done',
  log_date: '2026-09-07', feel: 'right', energy: 'ok', soreness: 'none', sore_areas: [], workaround_areas: [], scaled: false }));
const exLogs = (id, n, rating = 'good') => Array.from({ length: n }, (_, i) => ({ exercise_id: id, sets: [{ weight: 50 + i, reps: 12 }], rating,
  created_at: `2026-09-${String(7 + i).padStart(2, '0')}T10:00:00Z` }));

test('cycleSummary carries the areas each pattern loads and pain areas', () => {
  const s = cycleSummary({ patient, cycle, template: { days_per_week: 3 }, logs, exerciseLogs: exLogs('SQ06', 8),
    flags: [{ type: 'pain', detail: { area: 'knees' } }, { type: 'dizzy', detail: {} }], adjustments: [], library: LIBRARY });
  assert.deepEqual(s.patterns.SQ.areas, ['knees', 'hips']);
  assert.deepEqual(s.checkins.pain_areas, { knees: 1 });
});

test('defaultProposal applies earned level-ups and still validates', () => {
  const s = cycleSummary({ patient, cycle, template: { days_per_week: 3 }, logs, exerciseLogs: [...exLogs('SQ06', 8), ...exLogs('HP01', 8, 'hard')],
    flags: [], adjustments: [], library: LIBRARY });
  const ceilings = levelCeilings(reviewProfile(patient), { level_ceiling: 4, pattern_ceilings: {} }, LIBRARY);
  const d = defaultProposal(s, { ceilings });
  assert.deepEqual(d.level_changes.map((c) => c.pattern), ['SQ'], 'HP mostly Hard stays');
  assert.deepEqual(validateProposal(d, { summary: s, library: LIBRARY, profile: reviewProfile(patient), settings: {} }).errors, []);
});

test('levelCeilings: setup ceiling, pattern exceptions and what her library offers', () => {
  const c = levelCeilings(reviewProfile(patient), { level_ceiling: 4, pattern_ceilings: { VR: 1 } }, LIBRARY);
  assert.equal(c.SQ, 4);
  assert.equal(c.VR, 1, 'pattern exception');
  assert.equal(c.CA, 0, 'no carry in the fixture library');
  const home = levelCeilings(reviewProfile({ ...patient, equipment: MINIMAL }), { level_ceiling: 3, pattern_ceilings: {} }, LIBRARY);
  assert.equal(home.SQ, 3);
  assert.equal(home.VR, 1, 'only the band pulldown fits a minimal setup');
  assert.equal(levelCeilings(reviewProfile(patient), null, LIBRARY).SQ, 4);
});

test('applyLevelChoices: "Keep it where it was" drops that level-up and logs both outcomes', () => {
  const plan = { cycle_type: 'C2', level_changes: [{ pattern: 'SQ', change: 1, evidence: 'e1' }, { pattern: 'HP', change: 1, evidence: 'e2' },
    { pattern: 'HI', change: -1, evidence: 'e3' }] };
  const { plan: out, log } = applyLevelChoices(plan, ['HP', 'HI'], { SQ: 2, HP: 1, HI: 2 });
  assert.deepEqual(out.level_changes.map((c) => c.pattern), ['SQ', 'HI'], 'a level drop is not hers to keep');
  assert.deepEqual(log.map((l) => [l.type, l.detail.pattern]), [['level_change', 'SQ'], ['level_kept', 'HP'], ['level_change', 'HI']]);
  assert.deepEqual(log[0].detail, { pattern: 'SQ', from: 2, to: 3, evidence: 'e1', source: 'default' });
  assert.equal(log[2].reason, 'cycle_review_down');
  assert.equal(patternName('SQ'), 'Squat');
});
