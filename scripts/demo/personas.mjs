// Demo personas: three named, login-able patients at interesting points (roadmap P1, P2, P5) plus a deterministic
// crowd built from archetypes. All names are invented; no real people.

export const rng = (seed) => () => {           // mulberry32: same seed → same demo every time
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// start: days before seed day the program started. adherence: share of planned workouts done. strength: relative.
export const LOGIN_PERSONAS = [
  { key: 'P1', login: 'dana', name: 'Dana', age_band: '40-49', setup: 'commercial_gym', days: 3, minutes: 45, experience: 'none',
    check: {}, workarounds: ['knees'], restrictions: [], floor_ok: false, goal: 'keep_muscle', goal_words: 'Carry my grandkids without my knees hurting',
    start: 57, adherence: 0.95, strength: 1.0, hardRate: 0.04, story: 'Week 9: her cycle review is waiting. Very consistent; knees much better.' },
  { key: 'P2', login: 'maria', name: 'Maria', age_band: '50-59', setup: 'minimal_home', days: 2, minutes: 30, experience: 'some',
    check: { sitToStand: true }, workarounds: ['low_back'], restrictions: [], floor_ok: false, goal: 'everyday_strength', goal_words: 'Lift the laundry basket without my back complaining',
    dumbbells: [5, 8, 10, 12, 15], start: 31, adherence: 0.75, strength: 0.9, hardRate: 0.05, lowEnergyRate: 0.25,
    story: 'Week 5 at home with bands and light dumbbells; busy, sometimes scales on low-energy days.' },
  { key: 'P5', login: 'lisa', name: 'Lisa', age_band: '40-49', setup: 'commercial_gym', days: 3, minutes: 45, experience: 'some',
    check: {}, workarounds: [], restrictions: [], floor_ok: false, goal: 'habit', goal_words: 'Keep going even when work gets crazy',
    start: 44, adherence: 0.9, strength: 1.0, hardRate: 0.05, stopAfterDay: 34, skipReason: 'travel',
    story: 'Trained well for 5 weeks, then a work trip: 10 days without a workout. Shows the comeback session and the clinic call list.' },
];

const FIRST = ['Angela', 'Beth', 'Carmen', 'Denise', 'Erin', 'Fatima', 'Gina', 'Heather', 'Irene', 'Joy', 'Karen', 'Laura', 'Monica',
  'Nadia', 'Olivia', 'Pam', 'Rachel', 'Sandra', 'Tina', 'Ursula', 'Valerie', 'Wendy', 'Yolanda', 'Zoe', 'Brenda', 'Cheryl', 'Diane',
  'Frank', 'Greg', 'Tom'];
const INITIALS = 'ABCDEFGHJKLMNPRSTW';
const SETUPS = ['commercial_gym', 'commercial_gym', 'commercial_gym', 'home_gym', 'minimal_home', 'barbell_gym'];
const AGES = ['40-49', '40-49', '50-59', '50-59', '50-59', '60-69', '70+'];
const GOALS = ['keep_muscle', 'keep_muscle', 'everyday_strength', 'habit', 'look_feel'];
const AREAS = ['knees', 'low_back', 'shoulders', 'hips'];

// Archetypes: [count, adherence range, start range (days), extra]
const ARCHETYPES = [
  [9, [0.85, 1.0], [14, 84], {}],                          // steady
  [7, [0.6, 0.8], [14, 84], {}],                           // mostly there
  [4, [0.35, 0.55], [21, 70], { lowEnergyRate: 0.3 }],     // slipping
  [3, [0.8, 0.95], [28, 70], { stopBefore: [9, 16] }],     // stopped coming → call list
  [2, [0.9, 1.0], [2, 9], {}],                             // just started
  [1, [0, 0], [3, 3], { status: 'onboarding' }],           // signed up, hasn't finished setup
  [1, [0, 0], [6, 6], { status: 'paused', screening_flag: 'pause' }],   // screening pause, waiting on clearance
];

/** The crowd: deterministic from the seed. */
export function crowd(seed = 2026) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const span = ([lo, hi]) => lo + r() * (hi - lo);
  const out = [];
  let n = 0;
  for (const [count, adh, start, extra] of ARCHETYPES) {
    for (let i = 0; i < count; i++) {
      const name = `${FIRST[n % FIRST.length]} ${INITIALS[Math.floor(r() * INITIALS.length)]}.`;
      const experience = pick(['none', 'none', 'some', 'some', 'regular']);
      const setup = pick(SETUPS);
      const days = experience === 'regular' && r() < 0.4 ? 4 : r() < 0.25 ? 2 : 3;
      const startDays = Math.round(span(start));
      out.push({
        key: `C${String(++n).padStart(2, '0')}`, login: null, name, age_band: pick(AGES), setup, days,
        minutes: pick([30, 45, 45, 60]), experience,
        check: experience === 'none' ? {} : { sitToStand: r() < 0.7, inclinePushup: r() < 0.5, hinge: r() < 0.5 },
        workarounds: r() < 0.35 ? [pick(AREAS)] : [], restrictions: r() < 0.15 ? [pick(['overhead', 'floor', 'supine'])] : [],
        floor_ok: r() < 0.3, goal: pick(GOALS), goal_words: null,
        dumbbells: setup === 'minimal_home' ? [5, 8, 10, 12, 15] : setup === 'home_gym' ? [5, 8, 10, 12, 15, 20, 25, 30] : [],
        start: startDays, adherence: span(adh), strength: 0.75 + r() * 0.7, hardRate: 0.02 + r() * 0.05,
        lowEnergyRate: extra.lowEnergyRate ?? 0.08, status: extra.status ?? 'active', screening_flag: extra.screening_flag ?? 'none',
        stopAfterDay: extra.stopBefore ? Math.max(7, startDays - Math.round(span(extra.stopBefore))) : null,
        skipReason: null, seed: Math.floor(r() * 1e9),
      });
    }
  }
  return out;
}
