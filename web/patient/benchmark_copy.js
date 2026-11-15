// Benchmark wording (B13). PLACEHOLDER until Amanda supplies the test instructions, safety notes and scoring (her Q12).
// While BENCHMARK_COPY.status is 'placeholder' every benchmark screen carries a "draft wording" line, and the feature stays
// switched off (app_settings `benchmarks.enabled`). To go live: replace the strings below with her approved wording, set
// status to 'approved', bump web/version.js, then set `benchmarks.enabled` (docs/benchmarks.md).
import { WARNING_SIGNS } from './session_copy.js';

export const BENCHMARK_COPY = {
  status: 'placeholder',
  draftLine: 'Draft wording: not yet reviewed.',
  card: { title: 'Quick strength tests', body: 'Three short, optional tests so you can see your strength change over time. Skip any you like.', cta: 'Try them' },
  baselineLead: 'Do these once, at your own pace. Stop if anything hurts. You can skip any test.',
  transitionLead: 'The same tests again, so you can compare with last time. You can skip any test.',
  safety: WARNING_SIGNS,
  tests: {
    lower_body: { name: 'Lower-body test', how: 'Instructions will be added once they are reviewed.', label: 'Repetitions' },
    upper_body: { name: 'Upper-body test', how: 'Instructions will be added once they are reviewed.', label: 'Repetitions',
      variantLabel: 'Which version did you do?', variants: { wall: 'Wall', incline: 'Incline', knee: 'Knees', full: 'Full' } },
    carry_hold: { name: 'Hold test', how: 'Instructions will be added once they are reviewed.', label: 'Seconds' },
  },
  skipOne: 'Skip this test',
  save: 'Save my results',
  later: 'Not now',
  nothing: 'Add at least one result, or choose “Not now”.',
  saved: 'Saved. Your progress screen shows how you’re doing.',
  saveFailed: 'Couldn’t save. Check your connection and try again.',
  progressTitle: 'Strength tests',
  progressEmpty: 'Your results will show here after you do the tests.',
  changeText: (unit, n) => (n === 0 ? 'no change yet' : `${n > 0 ? '+' : '−'}${Math.abs(n)} ${unit}`),
  differentVersion: 'You tried a different version, so there is nothing to compare yet.',
};
