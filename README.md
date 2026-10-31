# glp1-proto

Prototype of a strength-training program app that GLP-1 weight-loss clinics offer to their patients.

- **Patient app** (`web/index.html`): phone-first installable PWA.
- **Admin** (`web/admin/`): operator view for clinics, patients, flags and AI proposals.
- **Clinic** (`web/clinic/`): read-only aggregate dashboard and the "worth a check-in call" list.
- **Engine** (`web/engine/`): pure ES modules (no DOM, no database). Runs in the browser and in Supabase Edge Functions. Unit-tested with `node --test`.
- **Backend:** Supabase (Auth, Postgres with row-level security, Storage, Edge Functions). The schema lives in `supabase/migrations/`.

> **Prototype status.** Fake demo data only. No real patient data may be entered into this deployment.

## Layout

```
web/                 everything deployed to GitHub Pages
  config.js          the ONLY place the Supabase URL / publishable key / brand live
  index.html         patient app
  admin/  clinic/    other entry pages
  shared/            Supabase client, auth, styles, UI helpers
  engine/            pure programming engine (tested)
  sw.js              service worker (only ever touches caches prefixed "glp1proto-")
supabase/
  migrations/        schema source of truth (Supabase CLI)
  tests/             SQL tests (RLS) run by scripts/test_db.sh
  functions/         Edge Functions (later phases)
scripts/             Python operator scripts (create users, import content, demo seed)
tests/               node --test suites
docs/                setup, Supabase settings, transfer runbook, architecture
```

Programming content (framework, exercise library, templates, lessons) is **not** in this repo. It lives in the operator's private content folder and is loaded into Supabase by `scripts/import_content.py`.

## Quick start

See `docs/setup.md`.

```
npm test                 # engine + static checks (CI and AI sessions; not needed on the operator machine)
bash scripts/test_db.sh  # migrations + RLS tests against a throwaway local Postgres

# operator machine (Windows): apply migrations by pasting them into the Supabase SQL Editor
.venv\Scripts\python.exe scripts\admin_cli.py migrations
```
