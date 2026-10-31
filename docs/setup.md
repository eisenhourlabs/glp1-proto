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

## Everyday
```powershell
git pull                                                   # get merged changes
.\.venv\Scripts\python.exe scripts\admin_cli.py migrations   # then paste any PENDING file into the SQL Editor
.\.venv\Scripts\python.exe scripts\import_content.py         # after editing the workbook
```

## Browser smoke tests (developer machine with Node + Playwright)
Not part of `npm test`: they need Chromium and the private content export.
```
python scripts/export_content_json.py --out ../content.local.json
node tests/browser/onboarding.smoke.mjs ../content.local.json [screenshot-dir]
node tests/browser/workout.smoke.mjs ../content.local.json [screenshot-dir]
node tests/browser/admin.smoke.mjs ../content.local.json [screenshot-dir]
node tests/browser/join.smoke.mjs ../content.local.json [screenshot-dir]
node tests/browser/review.smoke.mjs ../content.local.json [screenshot-dir]
```
They run the real pages against an in-memory fake of Supabase (`tests/browser/fake_supabase.js`). For real QR codes in the staff-kit test: `npm i -g qrcode-generator@2.0.4`.
