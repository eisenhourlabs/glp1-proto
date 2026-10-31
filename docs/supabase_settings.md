# Supabase dashboard settings

Everything in the hosted project that is **not** in a migration. Re-apply this list when the app moves to a new project (see `transfer_runbook.md`). Update it whenever a setting changes.

| Area | Setting | Prototype value | Why |
|---|---|---|---|
| Project | Name / region | `glp1-proto` · West US (Oregon) | |
| Authentication → Sign In / Providers | Email provider | On | Email + password login |
| | Allow new users to sign up | **Off** | Logins are created by `admin_cli.py` (later by the enrollment Edge Function); no open sign-up |
| | Confirm email | Default | Users created by the script are pre-confirmed |
| Authentication → URL Configuration | Site URL | `https://eisenhourlabs.github.io/glp1-proto/` | Base for auth email links |
| | Redirect URLs | `https://eisenhourlabs.github.io/glp1-proto/**` | Allows `reset.html` as the password-reset landing page |
| Authentication → Emails | SMTP | Built-in (rate-limited) | Fine for a few demo users. **Pilot:** custom SMTP (Resend/Postmark) |
| | Reset-password template | Default | **Pilot:** branded copy |
| Project Settings → API | Exposed schemas | `public` (default) | |
| Storage | Buckets | none yet | `media` (exercise demos) and `branding` (clinic logos) come in later migrations |
| Edge Functions | Secrets | none yet | Later: `ANTHROPIC_API_KEY`, VAPID keys |
| Database | Extensions | defaults (`pgcrypto`, `pg_cron` later) | |
| Billing | Plan | Free (pauses after ~7 days idle; unpause in the dashboard) | **Pilot:** Pro (backups) in Brad's org |
