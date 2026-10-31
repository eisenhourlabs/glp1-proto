# Setup (operator machine, Windows/PowerShell)

Needs **git**, **Node 20+** and **Python 3.10+**. Nothing here touches any other project.

## 1. Clone into its own folder
Keep it outside any other project folder.
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

## 3. Apply database migrations
With the Supabase CLI via npx (no install needed):
```powershell
npx supabase login                               # opens the browser once
npx supabase link --project-ref <project-ref>    # the xxxx in https://xxxx.supabase.co; asks for the DB password
npx supabase db push --dry-run                   # shows which migrations would run
npx supabase db push
.\.venv\Scripts\python.exe scripts\admin_cli.py whoami   # should print "Connected. clinics: 0"
```
Fallback if the CLI gives trouble: open Supabase → SQL Editor and paste each file in `supabase/migrations/` **in filename order**, once each. Tell Claude afterwards so the CLI's migration history can be repaired.

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

## Everyday
```powershell
git pull                      # get merged changes
npm test                      # engine + static checks
npx supabase db push          # after a PR that adds a migration
```
