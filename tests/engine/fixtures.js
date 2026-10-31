// Small synthetic library + slots for engine tests (the real content is private and not in this repo).

const areas = (k = 0, h = 0, lb = 0, ub = 0, sh = 0, ew = 0) =>
  ({ knees: k, hips: h, low_back: lb, upper_back_neck: ub, shoulders: sh, elbows_wrists: ew });

const ex = (id, level, equipment, o = {}) => ({
  id, name: o.name ?? id, pattern: id.slice(0, 2), level, equipment,
  load_type: o.load_type ?? 'dumbbell', measure: o.measure ?? 'reps', area_load: o.area_load ?? areas(),
  floor: o.floor ?? false, restrictions: o.restrictions ?? [], unilateral: false,
  muscles_primary: [], muscles_secondary: [], cues: ['cue'], pinned_substitutes: [], active: o.active ?? true,
});

export const LIBRARY = [
  ex('SQ01', 1, 'chair', { load_type: 'bodyweight', area_load: areas(1, 1) }),
  ex('SQ03', 2, 'bench|box|chair', { load_type: 'bodyweight', area_load: areas(1, 1) }),
  ex('SQ06', 2, 'm_legpress', { load_type: 'machine', area_load: areas(1, 1) }),
  ex('SQ07', 3, 'db|kb', { area_load: areas(2, 1, 1, 0, 1) }),
  ex('SQ11', 4, 'bb', { load_type: 'barbell', area_load: areas(2, 1, 2, 1, 1), restrictions: ['heavy'] }),
  ex('HI01', 1, 'wall', { load_type: 'bodyweight', area_load: areas(0, 1, 1) }),
  ex('HI05', 2, 'm_legcurl', { load_type: 'machine', area_load: areas(1) }),
  ex('HI07', 3, 'db', { area_load: areas(0, 1, 2), restrictions: ['bend_load'] }),
  ex('HI09', 3, 'none', { load_type: 'bodyweight', floor: true, restrictions: ['supine', 'floor'] }),
  ex('HP01', 1, 'wall', { load_type: 'bodyweight', area_load: areas(0, 0, 0, 0, 1, 1) }),
  ex('HP04', 2, 'm_chest', { load_type: 'machine', area_load: areas(0, 0, 0, 0, 1) }),
  ex('HP07', 3, 'db;bench', { area_load: areas(0, 0, 0, 0, 1, 1), restrictions: ['supine'] }),
  ex('HP09', 4, 'none', { load_type: 'bodyweight', floor: true, restrictions: ['floor'], area_load: areas(0, 0, 1, 0, 1, 2) }),
  ex('VP01', 1, 'band', { load_type: 'band' }),
  ex('VP04', 2, 'db;bench|chair', { restrictions: ['overhead'], area_load: areas(0, 0, 0, 1, 2, 1) }),
  ex('VR02', 1, 'band;chair', { load_type: 'band' }),
  ex('VR04', 2, 'm_pulldown|cable', { load_type: 'machine' }),
  ex('VR99', 2, 'band', { load_type: 'band', active: false }),
];

export const slot = (pattern, o = {}) => ({
  template_id: 'T', session: o.session ?? 'A', slot: o.slot ?? 'P1', ord: o.ord ?? 1, role: o.role ?? 'P', pattern,
  min_minutes: o.min_minutes ?? 30, sets_by_week: o.sets ?? [2, 2, 3, 3, 3, 3, 3, 3],
  reps_by_week: o.reps ?? Array(8).fill('10-12'), rir_by_week: o.rir ?? Array(8).fill('2'),
  time_range_sec: o.time ?? '20-30', rest_sec: 90, pair_with: null, prefer_ids: o.prefer ?? [], note: null,
});

export const GYM = ['chair', 'wall', 'bench', 'box', 'db', 'kb', 'band', 'm_legpress', 'm_legcurl', 'm_chest', 'm_pulldown', 'cable', 'bb'];
export const MINIMAL = ['chair', 'wall', 'band', 'db'];
