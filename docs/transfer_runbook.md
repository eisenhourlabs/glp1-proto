# Transfer runbook: Troy's accounts → Brad's company

Goal: move the app to accounts owned by Brad's company **without touching any other project**, with a working smoke test at the end. Keep this file current as the build grows.

## 0. Before you start
- [ ] Brad's company has: a GitHub org, a Supabase org, a hosting account (Cloudflare Pages recommended), an email provider, an Anthropic API account (if the in-app AI is live), and a domain (optional).
- [ ] Troy has been invited to each as a collaborator.
- [ ] Decide on the Supabase path:
  - **A (recommended): fresh projects.** Create `staging` + `prod` in Brad's org from the migrations and re-import content. Demo users are re-seeded, never migrated. Cleanest: no prototype data or settings carried over.
  - **B: transfer `glp1-proto`.** Supabase can move a project between organizations (Project Settings → General → Transfer project). Faster, but carries the prototype's data and settings.

## 1. Code
- [ ] GitHub: Settings → Transfer ownership of `eisenhourlabs/glp1-proto` to Brad's org. GitHub redirects the old URL.
- [ ] Make the repo **private**.
- [ ] Hosting: connect Cloudflare Pages to the repo (build output: `web/`, no build command). Remove the GitHub Pages workflow's deploy job, or keep Pages for staging.

## 2. Database (path A)
- [ ] Create the project(s) in Brad's org (Pro plan for prod: backups). HIPAA add-on / BAA if the attorney requires it.
- [ ] Apply every file in `supabase/migrations/` **in filename order** via SQL Editor (or the CLI, see `node_cli_later.md`). `admin_cli.py migrations` must say up to date.
- [ ] Re-apply every row in `supabase_settings.md` (auth URLs, sign-up off, SMTP, storage buckets, secrets, cron).
- [ ] Create real admin logins (`admin_cli.py create-user --role admin`).
- [ ] Import content: `python scripts/import_content.py` (from the private content folder).
- [ ] Re-create clinics, codes and branding for real clinics only (no demo clinics in prod; demo goes to staging).
- [ ] Deploy Edge Functions: for each folder in `supabase/functions/`, create the function in Dashboard → Edge Functions and paste the code (or `supabase functions deploy` if the CLI is in use). `enroll`: **Verify JWT off**.
- [ ] Reprint staff kits (Admin → Clinics → Staff kit): the QR codes point at the old address.

## 3. Configuration and secrets
- [ ] `web/config.js`: new `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `ENV`, `BRAND_NAME`, `DEMO_BANNER` (false in prod).
- [ ] Operator `.env`: new URL + service key.
- [ ] **Generate new** VAPID keys, Anthropic key and email key under Brad's accounts. Never reuse the prototype's.
- [ ] Update the auth Site URL / redirect URLs to the new domain.

## 4. Smoke test
- [ ] `npm test` and `bash scripts/test_db.sh` pass.
- [ ] Admin login works; clinics list loads.
- [ ] Clinic code lookup works on the enrollment page (`join.html?code=…`), and a test sign-up lands in onboarding.
- [ ] Demo patient (staging) can sign in, open a workout, log a set, finish the session.
- [ ] Clinic viewer sees only aggregates.
- [ ] Password reset email arrives and `reset.html` sets a new password.
- [ ] Push notification arrives on an installed iPhone PWA (once push exists).

## 5. Clean up Troy's side
- [ ] Delete the `glp1-proto` Supabase project from Troy's org (path A), after prod has run cleanly for a week.
- [ ] Revoke Troy's personal keys from any `.env`; delete the old Anthropic key if one was used.
- [ ] Move the private planning + content folder to Brad's storage / the new Claude Project.
