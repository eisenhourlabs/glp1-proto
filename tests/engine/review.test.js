import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cycleSummary, libraryOptions, defaultRecap, defaultProposal, applyLevelChanges, slotsWithSwaps, proposalLines,
  reviewProfile, NEXT_CYCLE } from '../../web/engine/review.js';
import { normalizeProposal, validateProposal, BANNED, PROPOSAL_TOOL, buildPrompt } from '../../web/engine/review_validate.js';
import { LIBRARY, slot, GYM, MINIMAL } from './fixtures.js';

const patient = { id: 'secret-id', age_band: '50-59', experience: 'none', goal: 'keep_muscle', setup: 'commercial_gym',
  equipment: GYM, restrictions: [], workarounds: [], floor_ok: false, pattern_levels: { SQ: 2, HP: 2, VR: 1, HI: 1 }, days_per_week: 3 };
const cycle = { id: 1, cycle_no: 1, cycle_type: 'C1', template_id: 'C1-3D', session_minutes: 45, start_date: '2026-09-07', week_modes: { 4: { mode: 'consolidate' } } };
const template = { template_id: 'C1-3D', days_per_week: 3 };
const L = (id, week, o = {}) => ({ id, week, session: o.session ?? 'A', status: o.status ?? 'done', log_date: '2026-09-07', feel: o.feel ?? 'right',
  energy: 'ok', soreness: o.soreness ?? 'none', sore_areas: o.sore ?? [], workaround_areas: o.wa ?? [], scaled: false, skip_reason: o.skip ?? null });
const logs = [];
for (let w = 1; w <= 9; w++) for (const s of ['A', 'B', 'C']) if (!(w === 5 && s === 'C')) logs.push(L(w * 10 + s.charCodeAt(0), w, { session: s }));
logs.push(L(999, 5, { status: 'skipped', skip: 'busy', session: 'C' }));
const exerciseLogs = [
  { exercise_id: 'SQ06', sets: [{ weight: 50, reps: 12 }], rating: 'good', created_at: '2026-09-07T10:00:00Z' },
  { exercise_id: 'SQ06', sets: [{ weight: 70, reps: 12 }], rating: 'good', created_at: '2026-11-02T10:00:00Z' },
  { exercise_id: 'HP04', sets: [{ weight: 20, reps: 10 }], rating: 'hard', created_at: '2026-09-07T10:00:00Z' },
  { exercise_id: 'HP04', sets: [{ weight: 20, reps: 10 }], rating: 'hard', created_at: '2026-11-02T10:00:00Z' },
];
const summary = cycleSummary({ patient, cycle, template, logs, exerciseLogs, flags: [{ type: 'dizzy' }], adjustments: [], library: LIBRARY,
  reflection: { worked: ['short_workouts'], in_the_way: ['busy'], adjust: 'more_challenge', focus: 'Stronger legs for stairs', days: 3, text: 'my doctor said…' } });
const profile = reviewProfile(patient);
const ctx = { summary, library: LIBRARY, profile, settings: {} };

test('cycleSummary is de-identified and complete', () => {
  const s = JSON.stringify(summary);
  assert.ok(!s.includes('secret-id') && !s.includes('doctor'), 'no ids or free text');
  assert.equal(summary.adherence.planned, 27);
  assert.equal(summary.adherence.completed, 26);
  assert.equal(summary.adherence.pct, 96);
  assert.deepEqual(summary.adherence.skips, { busy: 1 });
  assert.equal(summary.patterns.SQ.first.weight, 50);
  assert.equal(summary.patterns.SQ.last.weight, 70);
  assert.deepEqual(summary.patterns.HP.ratings, { hard: 2 });
  assert.equal(summary.flags.dizzy, 1);
  assert.deepEqual(summary.cycle.week_modes, { 4: 'consolidate' });
  assert.equal(summary.strength_wins[0].to, '70 lb');
  assert.equal(summary.reflection.focus, 'Stronger legs for stairs');
});

test('libraryOptions: her equipment, up to one level above', () => {
  const opts = libraryOptions(reviewProfile({ ...patient, equipment: MINIMAL }), LIBRARY);
  assert.ok(opts.SQ.every((e) => e.level <= 3));
  assert.ok(!opts.SQ.some((e) => e.id === 'SQ06'), 'no leg press at home');
  assert.ok(!opts.HP.some((e) => e.id === 'HP09'), 'floor push-up excluded below level 3 without opt-in');
});

test('default proposal: next in sequence, levels unchanged, her days and focus, a clean recap', () => {
  const d = defaultProposal(summary);
  assert.equal(d.cycle_type, 'C2');
  assert.equal(d.days_per_week, 3);
  assert.deepEqual(d.level_changes, []);
  assert.equal(d.focus, 'Stronger legs for stairs');
  assert.match(d.recap, /26 workouts/);
  assert.deepEqual(validateProposal(d, ctx), { errors: [], review: [] }, 'the default always validates');
  assert.equal(NEXT_CYCLE.C3, 'C3');
  assert.match(defaultRecap({ ...summary, strength_wins: [], adherence: { ...summary.adherence, completed: 1, best_streak: 1 } }, 'C1', 2), /1 workout in Cycle 1/);
});

const good = () => normalizeProposal({ cycle_type: 'c2', days_per_week: '3',
  level_changes: [{ pattern: 'SQ', change: 1, evidence: 'Leg press went from 50 to 70 lb with Good ratings.' }],
  swaps: [{ pattern: 'SQ', exercise_id: 'sq07', reason: 'fresh' }], recap: 'Great cycle. You showed up 26 times.', focus: 'Stronger legs', flags: [] });

const clean = { ...ctx, summary: { ...summary, flags: {} } };

test('validateProposal: a good proposal passes; the same level-up after a dizzy flag goes to review', () => {
  assert.deepEqual(validateProposal(good(), clean), { errors: [], review: [] });
  assert.deepEqual(validateProposal(good(), ctx).review, ['SQ up in a cycle with pain or dizzy flags']);
});

test('validateProposal catches bad AI output (evaluation set)', () => {
  const bad = (patch) => validateProposal({ ...good(), ...patch }, clean);
  assert.match(bad({ cycle_type: 'C3' }).errors[0], /not allowed/, 'skipping a cycle');
  assert.match(bad({ cycle_type: 'C9' }).errors[0], /unknown cycle/);
  assert.match(bad({ days_per_week: 5 }).errors[0], /not 2, 3 or 4/);
  assert.match(bad({ cycle_type: 'C1', days_per_week: 4 }).errors.join(), /Foundations/);
  assert.match(bad({ level_changes: [{ pattern: 'SQ', change: 2, evidence: 'x' }] }).errors.join(), /\+1 or -1/, 'two-level jump');
  assert.match(bad({ level_changes: [{ pattern: 'SQ', change: 1, evidence: 'a' }, { pattern: 'SQ', change: 1, evidence: 'b' }] }).errors.join(), /more than one/);
  assert.match(bad({ level_changes: [{ pattern: 'ZZ', change: 1, evidence: 'x' }] }).errors.join(), /unknown pattern/);
  assert.match(bad({ swaps: [{ pattern: 'SQ', exercise_id: 'SQ99', reason: '' }] }).errors.join(), /not in the library/, 'invented exercise');
  assert.match(bad({ swaps: [{ pattern: 'SQ', exercise_id: 'HP04', reason: '' }] }).errors.join(), /not a SQ exercise/);
  assert.match(bad({ level_changes: [], swaps: [{ pattern: 'SQ', exercise_id: 'SQ11', reason: '' }] }).errors.join(), /doesn't fit/, 'level 4 barbell at level 2');
  assert.match(bad({ swaps: ['SQ', 'HP', 'VR', 'HI'].map((p) => ({ pattern: p, exercise_id: `${p}01`, reason: '' })) }).errors.join(), /limit is 3/);
  assert.match(bad({ recap: 'Amazing! You must have lost 10 pounds lost off your belly.' }).errors.join(), /uses/, 'weight / body talk');
  assert.match(bad({ recap: 'Keep taking your Wegovy and lifting.' }).errors.join(), /wegovy/i, 'medication');
  assert.match(bad({ recap: 'word '.repeat(121) }).errors.join(), /121 words/);
  assert.match(bad({ focus: '' }).errors.join(), /focus/);
  const hpUp = validateProposal({ ...good(), swaps: [], level_changes: [{ pattern: 'HP', change: 1, evidence: 'Chest press felt fine.' }] }, ctx);
  assert.deepEqual(hpUp.errors, []);
  assert.ok(hpUp.review.some((r) => /mostly Hard/.test(r)) && hpUp.review.some((r) => /pain or dizzy/.test(r)), 'outside auto bounds → review');
  assert.ok(bad({ flags: [{ reason: 'Check her knees' }] }).review.some((r) => /AI flag/.test(r)));
  assert.ok(bad({ days_per_week: 4 }).review.some((r) => /4 days/.test(r)), 'more days than she chose → review');
  const lowAdh = validateProposal(good(), { ...clean, summary: { ...clean.summary, adherence: { ...summary.adherence, pct: 40 } } });
  assert.ok(lowAdh.review.some((r) => /40% adherence/.test(r)), '4 days / advancing for someone missing half her sessions');
  assert.deepEqual(validateProposal(null, ctx).errors, ['not a proposal']);
});

test('BANNED wording allows exercise loads but not body talk', () => {
  assert.ok(!BANNED.test('You moved from 10 lb to 15 lb dumbbells.'));
  assert.ok(BANNED.test('Your weight loss is going great'));
  assert.ok(BANNED.test('no more injuries'));
});

test('applyLevelChanges, slotsWithSwaps, proposalLines', () => {
  assert.deepEqual(applyLevelChanges({ SQ: 4, HP: 1 }, [{ pattern: 'SQ', change: 1 }, { pattern: 'HP', change: -1 }, { pattern: 'VR', change: 1 }]), { SQ: 4, HP: 1, VR: 2 });
  const slots = [slot('SQ', { session: 'B', slot: 'P1', ord: 1 }), slot('SQ', { session: 'A', slot: 'P1', ord: 1, prefer: ['SQ03'] }), slot('HP', { session: 'A', slot: 'P2', ord: 2 })];
  const out = slotsWithSwaps(slots, [{ pattern: 'SQ', exercise_id: 'SQ07' }]);
  assert.deepEqual(out.find((s) => s.session === 'A' && s.pattern === 'SQ').prefer_ids, ['SQ07', 'SQ03'], 'first SQ slot of the week');
  assert.deepEqual(out.find((s) => s.session === 'B').prefer_ids, [], 'later SQ slot untouched');
  const lines = proposalLines(good(), LIBRARY);
  assert.match(lines[0], /squat: one level up/);
  assert.match(lines[1], /New exercise for squat: SQ07/);
});

test('tool schema and prompt', () => {
  assert.equal(PROPOSAL_TOOL.name, 'propose_next_cycle');
  assert.ok(PROPOSAL_TOOL.input_schema.required.includes('recap'));
  const { system, user } = buildPrompt(summary, { SQ: [] }, 'BRIEF TEXT', {});
  assert.match(system, /never mention body weight/i);
  assert.match(system, /BRIEF TEXT/);
  assert.match(user, /library_options/);
  assert.ok(!user.includes('secret-id'));
});
