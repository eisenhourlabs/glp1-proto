# Working rules for AI sessions in this repo

This repo is the **GLP-1 clinic strength program prototype**. It is a separate product from Troy's personal strength app. The two must never touch.

## Hard boundaries
1. **Never reference, import, read or link to the strength app** (its repo, `05_Scripts`, `06_App`, or its Supabase project). `tests/static.test.js` enforces this. Ideas copied from it are rewritten here.
2. **Environment values live only in `web/config.js`** (web) and `.env` (scripts). No Supabase URL, key, project ref or account name anywhere else.
3. **No secrets in git.** The service key, API keys and the VAPID private key live in `.env` or Supabase secrets only.
4. **The service worker only touches caches prefixed `glp1proto-`.** The origin `eisenhourlabs.github.io` is shared with other apps. The same goes for localStorage/IndexedDB names: prefix with `CONFIG.STORAGE_PREFIX`.
5. **Programming content is not in this repo** (the repo is public). The framework, library, templates and lessons live in the operator's private content folder and are loaded into Supabase by the importer. Don't commit content files.
6. **Demo data only.** No real patient data in this deployment.

## Database
- The schema source of truth is `supabase/migrations/`. **Never edit a migration that has been applied.** Add a new one (`YYYYMMDDHHMMSS_name.sql`) **from `_TEMPLATE.sql.txt`**: it opens with a run-once guard and ends by inserting its version into `public.app_migrations`.
- **Every new table:** RLS enabled, explicit grants (revoke from anon/authenticated first; **grant service_role explicitly**, since the project has "Automatically expose new tables" off), and policies **with a test** in `supabase/tests/NNN_*.test.sql`.
- Clinic viewers never get table access to patient data. They get report functions that return aggregates plus the consented engagement row.
- Run `bash scripts/test_db.sh` (a throwaway local Postgres) before proposing any migration.
- The AI sandbox cannot reach Supabase. **Troy applies migrations by pasting each file into the Supabase SQL Editor** (no Node/CLI; see `docs/node_cli_later.md`) and runs operator scripts with `.venv\Scripts\python.exe`. Tell him exactly which file(s) to paste; `admin_cli.py migrations` shows what's pending. Add `--check` dry runs to every script that writes.

## Code
- Plain ES modules, no build step. **No file over ~400 lines.** Split by feature.
- `web/engine/` is pure: no DOM, no network, no Date.now() without injection. Every exported function has a unit test in `tests/engine/`.
- UI text is set with `textContent` (via `shared/dom.js`), never `innerHTML` with data.
- Relative URLs only (the app must work under any base path).
- `npm test` and `bash scripts/test_db.sh` must pass before every commit or PR.

## Workflow
- Branch, then open a PR to `main`. Troy merges. Merging to `main` deploys to GitHub Pages.
- Planning docs (analysis, roadmap) live in Troy's private `GLP1_Clinic_App_Build/` folder, not here.
- Keep `docs/transfer_runbook.md` and `docs/supabase_settings.md` current whenever a setting or dependency is added.
