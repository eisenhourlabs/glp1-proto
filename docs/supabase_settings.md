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
| | Secrets | `ANTHROPIC_API_KEY` (Anthropic Console → API keys). Optional `GLP1_AI_MODEL` (default `claude-sonnet-5-5`) | Without the key every review uses the standard plan, so nothing breaks. Later: VAPID keys |
| Database → `app_settings` | `ai.coach_brief` | Loaded by `scripts/import_ai_brief.py` from the private content folder | Extra judgment and voice guidance for the AI; hard rules stay in code |
| Database | Extensions | defaults (`pgcrypto`, `pg_cron` later) | |
| Billing | Plan | Free (pauses after ~7 days idle; unpause in the dashboard) | **Pilot:** Pro (backups) in Brad's org |
