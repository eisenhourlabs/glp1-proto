// Workout-screen text (Framework §3 S3–S5, §9, §10, §15). Plain words, short sentences, second person.

export const PRE_SESSION = [
  'Have something with protein 1–2 hours before, if you can.',
  'Keep water close and sip between sets.',
  'Stand up slowly from benches, chairs and the floor.',
];

export const ENERGY_OPTIONS = [
  { value: 'low', label: 'Low' }, { value: 'ok', label: 'OK' }, { value: 'good', label: 'Good' },
];

export const AREA_OPTIONS = [
  { value: 'knees', label: 'Knees' }, { value: 'hips', label: 'Hips' }, { value: 'low_back', label: 'Low back' },
  { value: 'upper_back_neck', label: 'Upper back / neck' }, { value: 'shoulders', label: 'Shoulders' },
  { value: 'elbows_wrists', label: 'Elbows / wrists' },
];

export const areaName = (a) => (AREA_OPTIONS.find((o) => o.value === a)?.label ?? a).toLowerCase();

export const SCALE_TODAY = {
  title: 'Want to scale today?',
  lead: 'Same workout, a little lighter: lighter weights on the main lifts and one less set on the others.',
  counts: 'A scaled session counts fully. Showing up beats skipping.',
};

export const DIZZY = {
  title: 'Stop and sit down',
  steps: [
    'Sit or lie down somewhere safe right now.',
    'Sip some water and breathe slowly.',
    'Rest for a few minutes. Don’t get up quickly.',
    'If it doesn’t settle within a few minutes, end today’s workout.',
  ],
  urgent: 'Call 911 or get urgent care if you have chest pain or pressure, trouble breathing, a racing or irregular heartbeat, or you faint.',
  flagged: 'We’ve let the program team know, so they can check in with you.',
};

export const WARNING_SIGNS = 'Stop and get care for chest pain or pressure, unusual shortness of breath, dizziness that doesn’t settle, a racing or irregular heartbeat, or fainting. Sharp joint pain means stop that exercise.';

export const HURTS = {
  title: 'Something hurts?',
  lead: 'Stop this exercise. Which fits best?',
  options: [
    { value: 'sore', label: 'Achy or sore muscles', hint: 'Normal, especially early on' },
    { value: 'tight', label: 'Tight, I want to protect it', hint: 'We’ll give that area a break' },
    { value: 'pain', label: 'Sharp, pinching or getting worse', hint: 'We’ll swap it and let the team know' },
  ],
  sore: 'Soreness is normal early on and fades as your body adapts. You can keep going, a little lighter, or swap.',
  pain: 'Skip this exercise today. If it’s severe or getting worse, please contact your clinic.',
};

export const RATING_OPTIONS = [
  { value: 'easy', label: 'Easy', hint: 'Many more left' },
  { value: 'good', label: 'Good', hint: '2–3 left' },
  { value: 'hard', label: 'Hard', hint: '1 or none left' },
];

export const EFFORT_CUE = (rir) => (String(rir).startsWith('3') ? 'Stop with about 3 good reps left.' : 'Stop with about 2 good reps left.');
export const BREATH_CUE = 'Breathe out as you push or stand. No straining.';
export const FAST_CUE = 'Lower with control, stand up with purpose.';

export const COMEBACK = {
  welcome_back: 'Welcome back! Today is a little lighter so you can ease back in.',
  reentry: 'Welcome back! Your next two workouts are lighter while you get back in rhythm.',
  restart: 'Welcome back! We’ll ease you in with lighter weights. Your levels are saved.',
};

export const SKIP_OPTIONS = [
  { value: 'busy', label: 'Busy' }, { value: 'low_energy', label: 'Low energy' },
  { value: 'not_feeling_well', label: 'Not feeling well' }, { value: 'sore', label: 'Sore' },
  { value: 'travel', label: 'Traveling' }, { value: 'other', label: 'Something else' },
];
