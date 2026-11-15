# Benchmarks (backlog B13) — built, switched off

Three short, optional strength tests. A patient does them at her **second workout** and again in **each transition week**
(week 9 of every cycle); the progress screen shows her first result against her latest.

## State today
- **Off.** Nothing is shown to patients: no home card, no progress section, no reads of the table. The switch is the
  `app_settings` row `benchmarks.enabled` (not set = off; `true`/`1` = on).
- **Placeholder wording.** `web/patient/benchmark_copy.js` has `status: 'placeholder'`: test names are generic ("Lower-body
  test", "Upper-body test", "Hold test"), the instructions say they will be added after review, and every benchmark screen
  carries the line "Draft wording: not yet reviewed." The three test ids in the database are generic too
  (`lower_body`, `upper_body`, `carry_hold`); the real tests (Framework §14) are named only in the private folder.
- Waiting on **Amanda's Q12**: test instructions, safety notes and scoring.

## How it works
- Table `benchmarks` (migration 013): patient, cycle, `moment` (`baseline` | `transition`), test, whole-number value (0–600:
  repetitions, or seconds for the hold), version of the test (the upper-body test has wall / incline / knees / full), a
  `client_ref` so a resend lands once. Patients read and add their **own** rows (adding only while `can_train()`); nobody
  edits or deletes; admins read; **clinic staff have no access** (SQL test). Aggregate numbers for clinics come later with D1.
- Offered by `web/engine/benchmarks.js`: **baseline** once ever (after her first workout, until she saves or says "Not now");
  **transition** once per cycle from week 9. "Not now" is remembered on that phone for that moment.
- Any test can be skipped, and nothing about a workout depends on it. Saves go through the outbox, so they work without a
  signal. Progress compares like with like: if her latest result used a different version of a test (for example full
  instead of wall), it says there is nothing to compare yet rather than showing a change.

## To turn it on (when the wording is approved)
1. In `web/patient/benchmark_copy.js`, replace the placeholder strings with Amanda's approved wording and set `status` to
   `'approved'` (removes the draft line). Add her safety notes to `safety` if they differ from the standard warning signs.
2. If her tests need different units, limits or versions, change `TESTS` in `web/engine/benchmarks.js` and the checks in
   migration 013 with a **new** migration (never edit an applied one).
3. Bump `web/version.js`, merge.
4. In the SQL Editor (see `docs/supabase_settings.md`): `insert into public.app_settings (key, value) values ('benchmarks.enabled', 'true'::jsonb) on conflict (key) do update set value = excluded.value;`
5. On a demo patient: do the tests at her second workout, check the progress screen, and check a clinic login sees no
   benchmark data.

## Not built yet
- The aggregate for clinics and the outcome report (D1); the AI cycle review does not see benchmarks yet (the review
  summary would need them added, which regenerates `ai-cycle-review`).
- A shared "Not now" across her devices (it is per phone).
