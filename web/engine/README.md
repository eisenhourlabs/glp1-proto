# Engine

Pure ES modules that turn *content* (framework rules, templates, library) and *patient data* into her program. No DOM, no network, no global clock: callers pass `today` in.

The same files run in the browser (live session adjustments) and in Supabase Edge Functions (cycle materialization, AI-proposal validation).

Modules:

| Module | Responsibility |
|---|---|
| `util.js` | constants (patterns, body areas, age bands), ranges, UTC-safe ISO date helpers |
| `resolve.js` | slot + patient profile + library → exercise, with the reason it differs from the unconstrained pick (equipment / work-around / restriction / floor); `swapNote()` copy |
| `load.js` | first-exposure "find your weight", double progression, increments by load type and age band, reps-first for 60+ / kettlebells / bands, Scale-today and comeback load cuts |
| `levels.js` | starting level per pattern (intake + Workout 1 check), starting cycle, level-up offers, level drops |
| `cycle.js` | week of cycle, adaptive week-4 / week-9 decision (§7.2a), weekly dose per slot, session queue, cycle materialization, template choice |
| `readiness.js` | Scale today, make it easier, work-around swaps, soreness adjustments |
| `adjust.js` | check-in adjustments (§12), pattern flags (§10), rest signals for the adaptive weeks |
| `adherence.js` | adherence, forgiving streak ("never two in a row"), comeback modes, clinic call / slipping flags |

Planned: `validate.js` (checks AI cycle proposals against the Framework, Phase 5), `badges.js` (Phase 3).

Tests live in `tests/engine/` (synthetic fixture library). `scripts/simulate.mjs` runs 9-week persona simulations against the real (private) content exported by `scripts/export_content_json.py`.
