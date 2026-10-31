// Patient levels per movement pattern (Framework §5.2, §5.3, §11.2).

import { PATTERNS } from './util.js';

const CHECK_PATTERNS = { sitToStand: ['SQ', 'SL'], inclinePushup: ['HP'], hinge: ['HI'] };

/**
 * Starting level for every pattern from the intake answer + the Workout 1 check.
 * experience: 'none' | 'some' | 'regular'; check: { sitToStand, inclinePushup, hinge } booleans (may be partial).
 * Never above 3 at start; 70+ capped at 2.
 */
export function startingLevels({ experience = 'none', check = {}, ageBand } = {}) {
  const cap = ageBand === '70+' ? 2 : 3;
  const allPassed = check.sitToStand && check.inclinePushup && check.hinge;
  // Regular trainers who pass all three checks start every pattern at 3 (Framework §5.2 table).
  const base = experience === 'none' ? 1 : experience === 'regular' && allPassed ? 3 : 2;
  const levels = Object.fromEntries(PATTERNS.map((p) => [p, Math.min(base, cap)]));
  for (const [test, pats] of Object.entries(CHECK_PATTERNS)) {
    if (check[test]) for (const p of pats) levels[p] = Math.min(cap, levels[p] + 1);
  }
  return levels;
}

/** Starting cycle (§11.1): C2 only for regular trainers who passed all three checks. */
export function startingCycle({ experience, check = {} } = {}) {
  return experience === 'regular' && check.sitToStand && check.inclinePushup && check.hinge ? 'C2' : 'C1';
}

/**
 * Offer the next level for a pattern (§5.3)? recent: last sessions on that pattern's exercise, newest last,
 * each { allTop: boolean, rating }. Offer when 2 of the last 3 hit the top of the range rated good/easy at the
 * heaviest load she has (atCeiling), or when she finished a cycle at this level progressing with no flags.
 */
export function shouldOfferLevelUp({ level, recent = [], atCeiling = false, cleanCycleAtLevel = false, maxLevel = 4,
  cycleType = null, week = null }) {
  if (level >= maxLevel) return false;
  if (cycleType === 'C1' && week != null && week < 3) return false;   // Foundations weeks 1–2 are technique weeks
  const last3 = recent.slice(-3);
  const good = last3.filter((r) => r.allTop && (r.rating === 'good' || r.rating === 'easy')).length;
  return (atCeiling && good >= 2) || cleanCycleAtLevel;
}

/**
 * Drop a level for a pattern (§5.3, automatic and reversible): "too hard" with missed reps at the lowest load for
 * 2 sessions, or 2+ work-around/pain flags on the pattern within 14 days.
 */
export function shouldDropLevel({ level, hardMissesAtLowest = 0, flags14d = 0 }) {
  if (level <= 1) return false;
  return hardMissesAtLowest >= 2 || flags14d >= 2;
}
