// Benchmarks (backlog B13): three short strength tests, offered at her second workout and in each transition week, shown
// as first against latest on the progress screen. Pure: no screen, no clock, no network.
// Built switched off: `benchmarks.enabled` (app_settings) is not set until Amanda's wording and safety notes are in (her Q12);
// the test names, instructions and variants in web/patient/benchmark_copy.js are placeholders until then.

export const TESTS = [
  { id: 'lower_body', unit: 'reps', max: 60, variants: [] },
  { id: 'upper_body', unit: 'reps', max: 60, variants: ['wall', 'incline', 'knee', 'full'] },
  { id: 'carry_hold', unit: 'seconds', max: 600, variants: [] },
];
export const TEST_IDS = TESTS.map((t) => t.id);
export const MOMENTS = ['baseline', 'transition'];

/** The switch. The setting may be stored as true, 1 or "true"; not set (or anything else) is off. */
export const benchmarksEnabled = (settings) => {
  const v = settings?.['benchmarks.enabled'];
  return v === true || v === 1 || v === '1' || v === 'true';
};

/**
 * Which set of tests to offer today, or null.
 * baseline: at her second workout (one done in this cycle, none recorded yet, ever).
 * transition: in week 9 of a cycle that has none recorded at the transition yet.
 * rows: all her benchmark rows ({ cycle_id, moment }). doneWorkouts: workouts done in the current cycle.
 */
export function benchmarkMoment({ settings, rows = [], cycleId, rawWeek, doneWorkouts }) {
  if (!benchmarksEnabled(settings)) return null;
  if (rawWeek >= 9 && !rows.some((r) => r.moment === 'transition' && r.cycle_id === cycleId)) return 'transition';
  if (rawWeek < 9 && doneWorkouts >= 1 && !rows.some((r) => r.moment === 'baseline')) return 'baseline';
  return null;
}

/** A typed value as a whole number inside the test's range, or null (blank, not a number, negative, too big). */
export function parseValue(test, raw) {
  const t = TESTS.find((x) => x.id === test);
  if (!t || raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= t.max ? n : null;
}

export const validVariant = (test, variant) => {
  const t = TESTS.find((x) => x.id === test);
  return Boolean(t) && (t.variants.length ? t.variants.includes(variant) : variant == null);
};

/**
 * First against latest for each test she has done. Compares like with like: if her latest result used a different
 * version of the test (for example full push-ups after wall push-ups), it says so and gives no change.
 * rows: { test, value, variant, created_at }. Returns [{ test, first, latest, change, sameVariant, count }].
 */
export function benchmarkProgress(rows) {
  const out = [];
  for (const t of TESTS) {
    const mine = rows.filter((r) => r.test === t.id).sort((a, b) => (a.created_at === b.created_at ? 0 : a.created_at < b.created_at ? -1 : 1));
    if (!mine.length) continue;
    const first = mine[0]; const latest = mine[mine.length - 1];
    const sameVariant = (first.variant ?? null) === (latest.variant ?? null);
    out.push({ test: t.id, unit: t.unit, first, latest, count: mine.length, sameVariant,
      change: mine.length > 1 && sameVariant ? latest.value - first.value : null });
  }
  return out;
}
