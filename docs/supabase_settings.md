# Supabase dashboard settings

Everything in the hosted project that is **not** in a migration. Re-apply this list when the app moves to a new project (see `transfer_runbook.md`). Update it whenever a setting changes.

| Area | Setting | Prototype value | Why |
|---|---|---|---|
| Project (create form) | Name / region | `glp1-proto` · Americas (or West US/Oregon via "Need a specific region?") | |
| | GitHub (optional) | **Not connected** | Migrations are pasted into the SQL Editor; keeps the repo transfer simple |
| | Enable Data API | **On** | The web app talks to the database through it |
| | Automatically expose new tables | **Off** | Every migration grants privileges explicitly (incl. service_role) |
| | Enable automatic RLS | **On** | Safety net; migrations also enable RLS explicitly |
| Authentication → Sign In / Providers | Email provider | On | Email + password login |
| | Allow new users to sign up | **Off** | Patients join through the `enroll` Edge Function (clinic code checked server-side); staff logins come from `admin_cli.py`. No open sign-up |
| | Confirm email | Default | Users created by the script are pre-confirmed |
| Authentication → URL Configuration | Site URL | `https://eisenhourlabs.github.io/glp1-proto/` | Base for auth email links |
| | Redirect URLs | `https://eisenhourlabs.github.io/glp1-proto/**` | Allows `reset.html` as the password-reset landing page |
| Authentication → Emails | SMTP | Built-in (rate-limited) | Fine for a few demo users. **Pilot:** custom SMTP (Resend/Postmark) |
| | Reset-password template | Default | **Pilot:** branded copy |
| Project Settings → API | Exposed schemas | `public` (default) | |
| Storage | Buckets | none yet | `media` (exercise demos) and `branding` (clinic logos) come in later migrations |
| Edge Functions | `enroll` | Deployed from `supabase/functions/enroll/index.ts` (Dashboard → Edge Functions → Deploy a new function → Via Editor, name `enroll`). **Verify JWT: Off** (the join page calls it with the publishable key) | Clinic-code self-enrollment. Uses the injected `SUPABASE_URL` and secret key; no secrets to add. **Pilot:** add a CAPTCHA (e.g. Turnstile) and a per-code daily cap |
| | `ai-cycle-review` | Deployed from `supabase/functions/ai-cycle-review/index.ts` (generated: `node scripts/build_functions.mjs`), same steps as `enroll`. **Verify JWT: Off** (it checks the caller's session itself) | End-of-cycle AI review (Framework §14) |
| | `client-error` | Deployed from `supabase/functions/client-error/index.ts` (generated), same steps as `enroll`. **Verify JWT: Off** (errors can happen before sign-in). Needs migration 012 | Stores browser errors from the apps (A14): app, role, cleaned message and stack, page path, app version, a count. No user id or address. Look at them in Table Editor → `client_errors` (sort by `last_seen_at`). Limits: 60 calls a minute in total, 5000 distinct errors, 90 days |
| | `health` | Deployed from `supabase/functions/health/index.ts` (generated), same steps. **Verify JWT: Off** (a monitor has no login) | Open `https://<project-ref>.supabase.co/functions/v1/health`: `{"ok":true,"database":"up",…}`, or status 503 with `"down"`. For a later uptime monitor (A14 monitor and daily digest wait on the company accounts and email sender, A1/A4) |
| | Secrets | `ANTHROPIC_API_KEY` (Anthropic Console → API keys). Optional `GLP1_AI_MODEL` (default `claude-sonnet-5-5`) | Without the key every review uses the standard plan, so nothing breaks. Later: VAPID keys |
| Database → `app_settings` | `ai.coach_brief` | Loaded by `scripts/import_ai_brief.py` from the private content folder | Extra judgment and voice guidance for the AI; hard rules stay in code |
| Database → `app_settings` | `report.min_cell` | **Not set** (default 5, migration 009) | Clinic reports hide any patient count of 1–4 ("fewer than 5") and show no percentages for a clinic under 5 patients. To change it, insert the row in the SQL Editor: `insert into public.app_settings (key, value) values ('report.min_cell', '5');` |
| Database → `app_settings` | `errors.max_per_minute` | **Not set** (default 60, migration 012) | Most error reports `client-error` accepts per minute, all callers together; the rest get status 429. To change it: `insert into public.app_settings (key, value) values ('errors.max_per_minute', '120') on conflict (key) do update set value = excluded.value;` |
| Database → `clinics.timezone` | Per clinic | Existing clinics `America/Chicago` (migration 008); new clinics take the admin's browser zone | Clinic reports count "today" in this zone. Change one with `update public.clinics set timezone = 'America/New_York' where name = '…';` |
| Database | Extensions | defaults (`pgcrypto`, `pg_cron` later) | |
| Billing | Plan | Free (pauses after ~7 days idle; unpause in the dashboard) | **Pilot:** Pro (backups) in Brad's org |
