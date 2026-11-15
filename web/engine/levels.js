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

export const LEVELUP_DEFAULTS = {
  'levelup.min_adherence_pct': 75,   // cycle adherence at least this
  'levelup.min_sessions': 6,         // sessions logged on the pattern in the cycle
  'levelup.too_hard_hold_pct': 40,   // "too hard" in at least this share of check-ins holds every level-up
  'levelup.max_area_reports': 2,     // work-around + "sore a lot" reports on the areas the pattern loads must be fewer than this
  'levelup.cap_70_plus': 2,          // highest level for 70+
};
const lcfg = (s, k) => (s && s[k] != null ? Number(s[k]) : LEVELUP_DEFAULTS[k]);

/**
 * Automatic level-ups at the cycle review (backlog B1, Amanda packet Q4). A pattern moves up one level when all hold:
 * adherence ≥ 75%; the pattern trained ≥ 6 times; most of its ratings Good or Easy; no pain report and fewer than 2
 * work-around or "sore a lot" reports on the areas it loads; below its ceiling (setup and library) and the 70+ cap.
 * No level-ups at all when ≥ 40% of check-ins were "too hard". At most +1 per pattern.
 * summary: cycleSummary(); ceilings: { pattern: highest level she can reach } (levelCeilings()).
 * @returns {{ changes: Array<{pattern, change: 1, evidence}>, held: Array<{pattern, reason}> }}
 */
export function reviewLevelUps(summary, { settings, ceilings = {} } = {}) {
  const changes = []; const held = [];
  const ck = summary.checkins || {};
  const tooHard = ck.count ? ((ck.feel?.too_hard ?? 0) / ck.count) * 100 : 0;
  if (tooHard >= lcfg(settings, 'levelup.too_hard_hold_pct')) {
    return { changes, held: Object.keys(summary.patterns || {}).map((pattern) => ({ pattern, reason: 'too_hard_cycle' })) };
  }
  const adherenceOk = (summary.adherence?.pct ?? 0) >= lcfg(settings, 'levelup.min_adherence_pct');
  const cap70 = summary.patient?.age_band === '70+' ? lcfg(settings, 'levelup.cap_70_plus') : 4;
  for (const [pattern, pat] of Object.entries(summary.patterns || {})) {
    const hold = (reason) => held.push({ pattern, reason });
    const level = pat.level ?? 1;
    const r = pat.ratings || {};
    const rated = (r.easy ?? 0) + (r.good ?? 0) + (r.hard ?? 0);
    const areas = pat.areas || [];
    const reports = areas.reduce((n, a) => n + (ck.workarounds?.[a] ?? 0) + (ck.sore_a_lot?.[a] ?? 0), 0);
    if (!adherenceOk) hold('adherence');
    else if ((pat.sessions ?? 0) < lcfg(settings, 'levelup.min_sessions')) hold('sessions');
    else if (!rated || (r.easy ?? 0) + (r.good ?? 0) <= rated / 2) hold('ratings');
    else if (areas.some((a) => (ck.pain_areas?.[a] ?? 0) > 0)) hold('pain');
    else if (reports >= lcfg(settings, 'levelup.max_area_reports')) hold('area_reports');
    else if (level >= Math.min(ceilings[pattern] ?? 4, cap70, 4)) hold('ceiling');
    else {
      const good = (r.easy ?? 0) + (r.good ?? 0);
      changes.push({ pattern, change: 1,
        evidence: `You trained it ${pat.sessions} times, rated it Good or Easy ${good} of ${rated} times, and did ${summary.adherence.pct}% of your workouts.` });
    }
  }
  return { changes, held };
}
