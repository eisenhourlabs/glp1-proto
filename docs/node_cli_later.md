# Deferred: Node + Supabase CLI (decided 2026-10-31)

**Decision:** the prototype does **not** use Node or the Supabase CLI on the operator machine. Migrations are applied by pasting each file into Supabase → SQL Editor (the same way the operator already works elsewhere), and `admin_cli.py migrations` tracks what is applied via `public.app_migrations`.

**Why:** fewer tools to install, and no saved Supabase CLI login. That login token can manage *every* project in the Supabase account, not just this one.

**Revisit when** any of these becomes painful:
- many migrations to paste at once (staging + prod after the transfer to Brad's accounts)
- deploying several Edge Functions repeatedly (the dashboard editor works but is manual)
- wanting `npm test` on the operator machine (CI already runs it on every PR)

## How to switch later
1. Install Node LTS: `winget install OpenJS.NodeJS.LTS` (or nodejs.org), then reopen PowerShell.
2. Prefer a **scoped** setup: create a Supabase personal access token just for this, use it via the `SUPABASE_ACCESS_TOKEN` environment variable for the session, and revoke it when finished, rather than a long-lived `supabase login`. Best done once the project lives in Brad's org, so the token can't reach other projects.
3. `npx supabase link --project-ref <ref>`.
4. Tell the CLI which migrations are already applied (they were pasted by hand):
   `npx supabase migration repair --status applied <version>` for every version listed by `admin_cli.py migrations`.
5. From then on `npx supabase db push` applies new files. Keep the run-once guard and the `app_migrations` insert in every migration so both tracking methods agree.
