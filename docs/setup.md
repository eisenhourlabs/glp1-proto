# Setup (operator machine, Windows/PowerShell)

Needs **git** and **Python 3.10+**. (Node is **not** needed. See `node_cli_later.md` for the optional Node/CLI route.) Nothing here touches any other project.

> **Run every command below from inside the `glp1-proto` folder.** If PowerShell says `.\.venv\Scripts\python.exe` "is not recognized", you're in the wrong folder: `cd $HOME\Documents\glp1-proto` first.

## 1. Clone into its own folder
Keep it outside any other project folder. (If your Documents folder syncs to OneDrive, consider `C:\dev` instead so the local `.env` key file doesn't sync.)
```powershell
cd $HOME\Documents
git clone https://github.com/eisenhourlabs/glp1-proto.git
cd glp1-proto
```

## 2. Local settings for scripts
```powershell
Copy-Item .env.example .env
notepad .env
```
Fill in `GLP1_SUPABASE_URL` and `GLP1_SUPABASE_SERVICE_KEY` (Supabase → Project Settings → API Keys → *secret* / service_role). `.env` is gitignored.

Python packages go in a private environment inside this folder (`.venv`), so nothing here can change the packages any other project on this computer uses:
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r scripts\requirements.txt
```
Run every script with `.\.venv\Scripts\python.exe` (no activation needed, so PowerShell's script policy doesn't matter).

## 3. Apply database migrations (SQL Editor)
```powershell
.\.venv\Scripts\python.exe scripts\admin_cli.py whoami        # "Connected. clinics: 0" once 001 is applied
.\.venv\Scripts\python.exe scripts\admin_cli.py migrations    # lists each file as applied / PENDING
```
For each **PENDING** file, in the order listed:
1. Open it from `supabase\migrations\` in Notepad and copy everything.
2. Supabase → **SQL Editor → New query**, paste, **Run**. Expect "Success. No rows returned."
3. Re-run `migrations` until it says **Database is up to date**.

Each migration records itself in the `app_migrations` table and refuses to run twice, so pasting one again is harmless (it stops with "already applied").

## 4. Create your admin login
```powershell
.\.venv\Scripts\python.exe scripts\admin_cli.py create-user --email <your email> --role admin --name Troy --check
.\.venv\Scripts\python.exe scripts\admin_cli.py create-user --email <your email> --role admin --name Troy
```
Use a different password from your strength app.

## 5. Check the deployed site
Open `https://eisenhourlabs.github.io/glp1-proto/admin/` and sign in. You should see empty **Clinics** and **Accounts** tables with you listed as admin.

## 6. (Optional) A demo clinic + demo patient to try the patient page
```powershell
.\.venv\Scripts\python.exe scripts\admin_cli.py create-clinic --name "Lakeside Weight & Wellness" --accent "#2f6f68" --demo
.\.venv\Scripts\python.exe scripts\admin_cli.py add-code --clinic "Lakeside Weight & Wellness" --code LAKESIDE
.\.venv\Scripts\python.exe scripts\admin_cli.py create-user --email <a test email> --role patient --clinic "Lakeside Weight & Wellness" --name Dana --demo --generate-password
.\.venv\Scripts\python.exe scripts\admin_cli.py list
```
Sign in at `https://eisenhourlabs.github.io/glp1-proto/` with the demo patient.

## 7. Load the programming content
Set `GLP1_CONTENT_DIR` in `.env` to the private content folder (the one holding `GLP1_Program_Master.xlsx`), e.g.
`GLP1_CONTENT_DIR=C:\Users\<you>\Documents\Claude\Projects\GLP1_Clinic_App\GLP1_Clinic_App_Build\content`
```powershell
.\.venv\Scripts\python.exe scripts\import_content.py --check      # validate only, never connects
.\.venv\Scripts\python.exe scripts\import_content.py              # upload as a new content version and make it current
```
Every import creates a **new content version**; patients keep the version their cycle started on. Close the workbook in Excel before importing.
The equipment sheet's optional `only_setups` column (comma-separated setup ids) limits which setups onboarding lists an
item for; blank = every setup. It needs migration 010 (`20261115001000_equipment_only_setups.sql`); the importer stops
before uploading anything if that migration is missing.
Settings rows are only added if missing (admin-tuned values are kept) unless `--reset-settings`.

## 8. Patient self-enrollment (the `enroll` Edge Function)
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it `enroll`, replace the sample code with all of `supabase/functions/enroll/index.ts`, and click **Deploy**.
3. Open the function → **Details** (or Settings) → turn **Verify JWT** ("Enforce JWT verification") **off** → Save.
4. Try it: open `join.html?code=YOURCODE` on the site, create an account, and you should land in onboarding.

Leave Authentication → "Allow new users to sign up" **off**: this function is the only way in, and it checks the code.
Staff kits (printable cards and a poster with a QR code) are in Admin → Clinics → Staff kit next to each active code.

## 9. The AI coach (end-of-cycle review)
1. Deploy `supabase/functions/ai-cycle-review/index.ts` exactly like `enroll` (name it `ai-cycle-review`, **Verify JWT off**).
2. Optional but recommended: Supabase → Edge Functions → **Secrets** → add `ANTHROPIC_API_KEY` (from console.anthropic.com → API keys).
   Without it, every review uses the standard plan (next cycle in sequence, levels unchanged), so nothing breaks.
3. Load the coach brief from the private content folder: `.venv\Scripts\python.exe scripts\import_ai_brief.py`
4. Pending reviews (rule problems or outside the auto-apply bounds) appear in Admin → **AI reviews**.

The function file is generated from `supabase/functions_src/ai-cycle-review/` and the engine. After changing either, run
`node scripts/build_functions.mjs` (the tests fail if the committed file is stale).

## 10. Demo data for a walkthrough (Phase 6)
The dataset `demo_seed.local.json` is built from the private content and lives in the content folder (never in this
repo). To rebuild it (developer machine with Node): `node scripts/demo_data.mjs ../content.local.json <content folder>/demo_seed.local.json`.

```
.venv\Scripts\python.exe scripts\demo.py seed --check   # compare the dataset with the database; changes nothing
.venv\Scripts\python.exe scripts\demo.py reset           # the morning of a demo: reload with today's dates
.venv\Scripts\python.exe scripts\demo.py status          # how many demo logins exist
.venv\Scripts\python.exe scripts\demo.py remove          # delete every demo login and its data
```
Demo logins end in `@glp1demo.example`. The ones you can sign in with (dana, maria, lisa, frontdesk, brad) use
`GLP1_DEMO_PASSWORD` from `.env`, or the password you type when asked. The walkthrough is in the private
`GLP1_Clinic_App_Build/Demo_Script.md`.

## Everyday
```powershell
git pull                                                   # get merged changes
.\.venv\Scripts\python.exe scripts\admin_cli.py migrations   # then paste any PENDING file into the SQL Editor
.\.venv\Scripts\python.exe scripts\import_content.py         # after editing the workbook
```

## Persona speed-run (developer machine with Node)
See `docs/speedrun.md`: made-up patients through the real engine for 30 weeks, checked against the Framework rules.

## Browser smoke tests and accessibility scan (developer machine with Node + Playwright)
CI runs all of them on every pull request (job `browser` in `.github/workflows/pages.yml`) against
`tests/fixtures/content.synthetic.json`: made-up content (invented names, first field `_synthetic`) built by
`python scripts/make_synthetic_content.py` and checked by `content_check`. Never import it into a database. Locally,
run them on the synthetic content or on the real export (more realistic):
```
npm i -g playwright@1.63.0 axe-core@4.10.3 && npx playwright@1.63.0 install chromium
F=tests/fixtures/content.synthetic.json                   # or: python scripts/export_content_json.py --out ../content.local.json
node scripts/demo_data.mjs $F /tmp/demo.json              # or use <content folder>/demo_seed.local.json with the real export
for t in admin join onboarding review workout age60 comeback lighter update offline a11y errors benchmarks; do node tests/browser/$t.smoke.mjs $F [screenshot-dir]; done
node tests/browser/demo.smoke.mjs $F /tmp/demo.json [screenshot-dir]
```
They run the real pages against an in-memory fake of Supabase (`tests/browser/fake_supabase.js`, served in place of
`web/vendor/supabase-js.js`). Accessibility: set `A11Y_REPORT=/tmp/a11y.jsonl` while running them (every screenshot
point is scanned with axe), then `node scripts/a11y_report.mjs /tmp/a11y.jsonl`. Serious or critical issues fail
unless listed in `tests/browser/a11y_known.json` (the open list for backlog C6).

## Offline workouts (C4)
- With a signal, the patient app saves copies of what a workout needs (profile, patient, plan, content, warm-ups,
  logs) in IndexedDB (`glp1proto-offline`). Without one, she can start, log, finish and check in: each write is applied
  on the phone and queued in localStorage (`glp1proto.outbox.<user>`), then sent in order when the signal is back. The
  header says "Saved on this phone…" while anything waits. Needs migration 011 (`client_ref`).
- Not offline: onboarding, the end-of-cycle review, accepting a level-up offer, settings. They show the usual
  "check your connection" message.
- Sign-out wipes the saved copies; unsent workouts stay queued for that user's next sign-in on the phone.

## App versions and updates (C5)
- `web/version.js` holds the one version constant. **Bump it in every PR that changes anything under `web/`** (CI
  checks). The service worker caches every file for that version; phones keep the old version until the new one is
  installed, then the home screen shows "Update ready". Nothing changes in the middle of a workout.
- After adding, renaming or deleting a file under `web/`: `node scripts/sw_assets.mjs` (rewrites the cache list in
  `web/sw.js`; `npm test` fails until it matches).

## Third-party scripts (A3)
Self-hosted in `web/vendor/`; the app loads nothing from a CDN. Rebuild with `bash scripts/vendor.sh` (versions are
pinned there), then run every test and bump `web/version.js`.

| File | Package | Version | License | sha256 |
|---|---|---|---|---|
| `web/vendor/supabase-js.js` | `@supabase/supabase-js` (+ auth-js, functions-js, postgrest-js, realtime-js, storage-js 2.117.3; phoenix 0.4.5), bundled with esbuild 0.25.10 | 2.117.3 | MIT | 15b554eeb58cbc747bb92e4610e930a15935b4d5896d780456f202f28d9e2d69 |
| `web/vendor/qrcode.js` | `qrcode-generator` (`dist/qrcode.mjs`) | 2.0.4 | MIT | f34620800b9854f6877235e81d5ee5fe5dbe744f74da114b034fe907cf9d5b3f |
