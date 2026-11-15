// Synthetic content for speed-run tests: the same shape export_content_json.py produces, with invented exercises
// (ids like SQ13 = squat, variant 1, level 3). Not the real programming content, which is private.

import { PATTERNS } from '../../web/engine/util.js';

const areas = (o = {}) => ({ knees: 0, hips: 0, low_back: 0, upper_back_neck: 0, shoulders: 0, elbows_wrists: 0, ...o });
const TIMED = new Set(['CO', 'BA', 'CA']);
const BAND = new Set(['VP', 'HR', 'VR', 'HA', 'AR']);
const BODY = new Set(['SQ', 'HI', 'SL', 'HP', 'CO', 'BA']);

function load(p, level) {
  const o = {};
  if (p === 'SQ' || p === 'SL') o.knees = level >= 3 ? 2 : 1;
  if (p === 'HI') o.low_back = level >= 3 ? 2 : 1;
  if (p === 'VP' || p === 'HP') o.shoulders = level >= 3 ? 2 : 1;
  return areas(o);
}

function ex(p, variant, level, equipment, loadType, extra = {}) {
  return {
    version: 0, id: `${p}${variant}${level}`, name: `Practice ${p} ${variant}-${level}`, pattern: p, level, equipment,
    load_type: loadType, measure: TIMED.has(p) ? 'time' : 'reps',
    area_load: load(p, level), floor: false, restrictions: [], unilateral: false, muscles_primary: [], muscles_secondary: [],
    cues: ['Synthetic cue'], media_status: 'needed', pinned_substitutes: [], active: true, notes: null, ...extra,
  };
}

function library() {
  const out = [];
  for (const p of PATTERNS) {
    for (let level = 1; level <= 4; level++) {
      // Variant 1: no equipment (bodyweight) or a band.
      const v1Load = BODY.has(p) ? 'bodyweight' : BAND.has(p) ? 'band' : 'dumbbell';
      const v1Equip = v1Load === 'bodyweight' ? (level === 1 ? 'chair|wall' : 'none') : v1Load === 'band' ? 'band' : 'db|kb';
      const extra1 = {};
      if (p === 'CO' && level === 3) Object.assign(extra1, { floor: true, restrictions: ['floor', 'supine'] });
      if (p === 'HP' && level === 4) Object.assign(extra1, { floor: true, restrictions: ['floor'] });
      out.push(ex(p, 1, level, v1Equip, v1Load, extra1));
      // Variant 2: dumbbells (overhead pressing restricted).
      out.push(ex(p, 2, level, level >= 3 && (p === 'HP' || p === 'HI') ? 'db;bench' : 'db', 'dumbbell',
        p === 'VP' && level >= 2 ? { restrictions: ['overhead'] } : {}));
      // Variant 3: machines at levels 2-3, barbell at 4 (gyms only).
      if (level >= 2 && ['SQ', 'HI', 'HP', 'HR', 'VR'].includes(p)) {
        out.push(level === 4 ? ex(p, 3, 4, 'bb', 'barbell') : ex(p, 3, level, `m_${p.toLowerCase()}`, 'machine'));
      }
    }
  }
  return out;
}

const SESSIONS = {
  A: [['P1', 'P', 'SQ'], ['P2', 'P', 'HR'], ['S1', 'S', 'HP'], ['S2', 'S', 'HA'], ['F1', 'F', 'CO'], ['O1', 'O', 'AR', 45]],
  B: [['P1', 'P', 'HI'], ['P2', 'P', 'HP'], ['S1', 'S', 'VR'], ['S2', 'S', 'SL'], ['F1', 'F', 'CA'], ['F2', 'F', 'BA'], ['O1', 'O', 'VP', 45]],
  C: [['P1', 'P', 'SL'], ['P2', 'P', 'VR'], ['S1', 'S', 'VP'], ['S2', 'S', 'HI'], ['F1', 'F', 'CO'], ['F2', 'F', 'BA']],
  D: [['P1', 'P', 'SQ'], ['P2', 'P', 'HR'], ['S1', 'S', 'HP'], ['S2', 'S', 'HA'], ['F1', 'F', 'CA']],
};

function templatesAndSlots() {
  const templates = []; const slots = [];
  for (const [type, dayList] of [['C1', [2, 3]], ['C2', [2, 3, 4]], ['C3', [2, 3, 4]]]) {
    for (const days of dayList) {
      const id = `${type}-${days}D`;
      const letters = ['A', 'B', 'C', 'D'].slice(0, days);
      templates.push({ version: 0, template_id: id, cycle_type: type, days_per_week: days, name: `${type} · ${days} days`,
        sessions: letters.map((s) => ({ session: s, name: `Session ${s}` })), entry_rule: null, active: true });
      for (const s of letters) {
        SESSIONS[s].forEach(([slot, role, pattern, min = 30], i) => slots.push({
          version: 0, template_id: id, session: s, slot, ord: i + 1, role, pattern, min_minutes: min,
          sets_by_week: role === 'P' ? [2, 2, 3, 3, 3, 3, 3, 3] : [2, 2, 2, 3, 3, 3, 3, 3],
          reps_by_week: Array(8).fill(role === 'P' ? '8-12' : '10-15'),
          rir_by_week: Array(8).fill(type === 'C1' ? '3' : role === 'P' ? '2' : '2-3'),
          time_range_sec: TIMED.has(pattern) ? '20-30' : null, rest_sec: role === 'P' ? 90 : 60, pair_with: null,
          prefer_ids: [], note: null,
        }));
      }
    }
  }
  return { templates, slots };
}

const SETUPS = [
  ['commercial_gym', ['chair', 'wall', 'bench', 'box', 'db', 'kb', 'band', 'cable', 'm_sq', 'm_hi', 'm_hp', 'm_hr', 'm_vr']],
  ['barbell_gym', ['chair', 'wall', 'bench', 'box', 'db', 'kb', 'band', 'bb', 'm_sq', 'm_hp', 'm_hr', 'm_vr']],
  ['home_gym', ['chair', 'wall', 'bench', 'db', 'band']],
  ['minimal_home', ['chair', 'wall', 'band', 'db']],
].map(([setup, equipment]) => ({ setup, equipment: ['none', ...equipment], level_ceiling: 4, pattern_ceilings: {} }));

export function speedrunContent() {
  return { library: library(), ...templatesAndSlots(), setups: SETUPS, warmups: [], equipment: [], settings: {} };
}
