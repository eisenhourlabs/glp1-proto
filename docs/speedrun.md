# Persona speed-run (backlog E1)

Runs made-up patients through the real engine with no database: every workout, check-in, adjustment, comeback and
cycle review, week by week, for as many weeks as you ask. It is the check for every change to the programming rules:
run it on `main` and on the pull request's branch, and compare.

- **Violations** are Framework rules the engine must always keep (level, 70+ cap, provider restrictions, floor,
  work-arounds, equipment, reps in reserve, sets, load jumps, increases per week, comebacks, the review validator).
  The run should report none; the command exits with code 1 if it finds any.
- **Watch items** are known gaps that sprint 1 is fixing (level-ups never applied, the same level-1 exercise twice in
  a week, band flips, "too easy" weeks that add nothing). They are counted so each pull request shows them move.

## Files
| File | What |
|---|---|
| `scripts/speedrun.mjs` | the command |
| `scripts/speedrun/run.mjs` | the simulation (same engine calls, same order, as the patient app) |
| `scripts/speedrun/checks.mjs` | violations and watch items |
| `scripts/speedrun/report.mjs`, `compare.mjs` | Markdown reports and the before/after compare |
| `scripts/speedrun/personas.example.json` | synthetic personas and the file format (the real list lives in the private folder) |
| `tests/speedrun.test.js` | runs the example personas on synthetic content in CI |

## Run it (needs Node and the Python environment)
The reports name real exercises, so they go to the private folder, never this repo (the command refuses an output
folder inside the repo). From the `glp1-proto` folder, in PowerShell, one line:

```powershell
.venv\Scripts\python.exe scripts\export_content_json.py --out ..\GLP1_Clinic_App_Build\speedrun\content.local.json; node scripts\speedrun.mjs --personas ..\GLP1_Clinic_App_Build\speedrun\personas.json --content ..\GLP1_Clinic_App_Build\speedrun\content.local.json --weeks 30 --out ..\GLP1_Clinic_App_Build\speedrun\latest
```

Open `..\GLP1_Clinic_App_Build\speedrun\latest\index.md` (one page for all personas, links to each persona's
week-by-week page).

Node is only needed for this and the browser tests; installing it (`winget install OpenJS.NodeJS.LTS`) does not
involve the Supabase CLI or its login (see `node_cli_later.md`).

## Before and after a change
```
node scripts/speedrun.mjs ... --out <folder>/before --engine main
node scripts/speedrun.mjs ... --out <folder>/after --engine <branch> --compare <folder>/before/results.json
```
`after/compare.md` lists, per persona: plan picks that changed, levels at the end, session lines that changed (exercise,
sets, weight), and violation and watch counts before → after. Sprint 1 keeps these in the private
`GLP1_Clinic_App_Build/sprint1/` folder for Amanda.

## Personas file
`{ "personas": [ ... ] }`. Each persona: `key`, `name`, `story`, `age_band`, `setup` (a setup name from the
workbook), `days`, `minutes`, `experience` (`none|some|regular`), `check` (Workout 1 checks), `workarounds`,
`restrictions`, `floorOk`, `strength` (1.0 = typical; scales her starting capacity), `dumbbells` (home set; empty = full
rack), and optionally:
- `weeks`: `{ "<calendar week>": [session, ...] }`. A week not listed does every planned session with an ordinary
  check-in. `[]` is a week with no workouts; after week 9 of a cycle it means she has not started her next cycle yet.
  Session fields: `feel` (`too_easy|right|too_hard`), `energy` (`low|ok|good`), `scale` (with low energy), `sore` +
  `soreness` (`some|a_lot`), `areas` (work-around chips), `pain` (an area).
- `events`: `{ "<calendar week>": { "setup": "...", "dumbbells": [...] } }`: used from her next cycle.
- `review`: `{ "days": 4 }`: what she picks at her cycle reviews.
