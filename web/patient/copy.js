// Patient-facing document text and screening questions.
// PROTOTYPE DRAFTS: an attorney must review the consent, waiver and screening wording before any real patient.
// Bump the *_VERSION string whenever the wording changes; signed copies record the version.

export const CONSENT_VERSION = 'consent-draft-2026-10-31';
export const WAIVER_VERSION = 'waiver-draft-2026-10-31';
export const SCREENING_VERSION = 'screening-draft-2026-10-31';
export const CLEARANCE_VERSION = 'clearance-draft-2026-10-31';

export const CONSENT = {
  title: 'What your clinic will see',
  lead: 'Your clinic offers this program. To help you stay on track, they can see a little about how it’s going, and nothing more.',
  sees: [
    'That you’ve joined the program',
    'Whether you’re active (worked out in the last week)',
    'How many workouts you did each week',
    'The reason you picked when you skipped a workout (for example “busy”)',
  ],
  neverSees: [
    'Your weights, sets or reps',
    'Your check-in answers or notes',
    'Your health screening answers',
  ],
  agree: 'I understand what my clinic will see.',
};

export const WAIVER = {
  title: 'Before you start',
  points: [
    'This is a fitness program, not medical care. It doesn’t replace advice from your clinic or doctor.',
    'Exercise has some risk of injury. Go at your own pace, use weights you can control, and stop if something hurts.',
    'Stop right away and get help if you have chest pain, faint, feel very short of breath, or feel dizzy and it doesn’t pass.',
    'Tell your clinic if your health changes.',
  ],
  agree: 'I’ve read this and agree to take part.',
};

/** Any "yes" here pauses the program until she confirms her provider has cleared her. */
export const RED_FLAG_QUESTIONS = [
  { key: 'chest', text: 'In the past month, have you had chest pain, pressure or tightness, at rest or when active?' },
  { key: 'faint', text: 'In the past year, have you fainted, or lost your balance because of dizziness?' },
  { key: 'told_not_to', text: 'Has a doctor or provider told you not to exercise right now?' },
];

/** Movement restrictions (Framework §11.3): absolute exclusions, never diagnoses. */
export const RESTRICTION_OPTIONS = [
  { value: 'bend_load', label: 'Bending forward while holding weight' },
  { value: 'heavy', label: 'Lifting heavy things' },
  { value: 'overhead', label: 'Lifting my arms overhead' },
  { value: 'impact', label: 'Jumping or impact' },
  { value: 'supine', label: 'Lying flat on my back' },
  { value: 'floor', label: 'Getting down to the floor' },
];

export const CLEARANCE = {
  title: 'Let’s get you cleared first',
  lead: 'Based on your answers, please check with your clinic or doctor before you start. Once they’ve said exercise is OK for you, come back and confirm below. Your program is ready and waiting.',
  agree: 'My doctor or clinic provider has told me it’s OK to start this exercise program.',
};
