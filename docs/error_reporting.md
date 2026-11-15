# Error reporting and the health check (backlog A14)

## What it does
- Every page (patient app, admin, clinic dashboard, join page) catches script errors and unhandled promise rejections and posts
  them to the `client-error` Edge Function (`web/shared/errors.js`). The function stores each **distinct** error once in
  `client_errors` and counts repeats, so a bug that hits many phones is one row with a count.
- The `health` Edge Function answers "is the backend up?": `200 {"ok":true,"database":"up"}` or `503 {"ok":false,"database":"down"}`.
- Not built yet (they wait on the company accounts, backlog A1/A4): the daily email digest to admins and the external uptime
  monitor. Until then, look at the table by hand.

## What is stored (and what is not)
`client_errors`: app (`patient`, `admin`, `clinic`, `join`), role (`patient`, `admin`, `clinic_viewer`, or empty before sign-in),
message, stack (12 lines at most), page path **without** the query, app version, count, first and last seen. **No user id, no IP
address, no email, nothing she typed.** The cleaning is `web/engine/error_report.js`; it runs in the browser and again in the
function. It removes emails, ids, phone numbers, long numbers, tokens, the web address of every file, query strings and long
quoted text. It is best effort: it can't know every way a message could carry text, which is why the table is readable by admins only.

Not reported: errors while the phone is offline, network failures ("Failed to fetch"), aborted requests, browser quirks and
browser-extension errors. A page sends at most 5 distinct errors.

## Limits
The function accepts 60 calls a minute in total (`app_settings` key `errors.max_per_minute`), stores at most 5000 distinct errors
and drops errors not seen for 90 days. Beyond the limit it answers 429. The limit is global, so a flood can crowd out real
reports for a minute; it protects the database, not the reports.

## Turning it off
`ERROR_REPORTING: false` in `web/config.js` (and bump `web/version.js`).

## Check it works (Troy, after deploying)
1. Open `https://<project-ref>.supabase.co/functions/v1/health` in a browser: `{"ok":true,"database":"up",…}`.
2. Open the patient app, press F12, open the Console, type `setTimeout(() => { throw new Error('test error from Troy') }, 0)` and press Enter.
3. Supabase → Table Editor → `client_errors`: a row with message `Error: test error from Troy` appears within a minute (reload the table).
4. Do step 2 again: the same row's `count` becomes 2.
