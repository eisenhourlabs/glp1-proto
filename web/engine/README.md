# Engine

Pure ES modules that turn *content* (framework rules, templates, library) and *patient data* into her program. No DOM, no network, no global clock: callers pass `today` in.

The same files run in the browser (live session adjustments) and in Supabase Edge Functions (cycle materialization, AI-proposal validation).

Planned modules (Phase 2):

| Module | Responsibility |
|---|---|
| `resolve.js` | template slot + patient profile + library → exercise, with a human-readable reason |
| `load.js` | first-exposure "find your weight", double progression, increments by load type and age band |
| `levels.js` | starting level per pattern (intake + Workout 1 check), level-up offers |
| `readiness.js` | "Scale today", work-around swaps, soreness rules |
| `adjust.js` | session feel / soreness → next-session volume within admin bounds; pattern flags |
| `cycle.js` | weekly queue, rollover, transition week, cycle materialization |
| `adherence.js` | scheduled vs completed, forgiving streak, welcome-back, inactivity and slipping flags |
| `badges.js` | milestones and progress levels |
| `validate.js` | checks any plan or AI proposal against the framework and her filtered library |

Tests live in `tests/engine/`.
