# Real-phone checks (backlog C9)

A checklist for Troy to run on his own phone. Nothing here needs a computer except where it says **Laptop**.
Each line is one action, followed by what you should see or hear. If you see something else, write it down in the
results table at the end (section 15) and keep going: one problem should not stop the rest of the check.

Written 2026-11-15 for app version `2026.11.15-6` or later (sprint 1 PRs 1-12 and the small fix in PR #28).
**Merge PR #28 before section 9**: the screen-reader steps describe the behaviour after that fix.

How long: about 90 minutes for the iPhone, 60 for an Android phone, plus a 2-minute look 7 days later (section 14).

---

## 0. Words used in this list
- **The app**: Strength Practice, the patient app at `https://eisenhourlabs.github.io/glp1-proto/`.
- **The icon**: the "Strength" icon on your home screen after section 2.
- **Close the app fully** (iPhone): swipe up from the bottom edge and pause, so all open apps show as cards; push the
  Strength card up and off the top. (Android: tap the square or three-line button, or swipe up and hold; push the card up.)
- **Test logins**: the new patients you create in this check. Always use an email ending in `@glp1demo.example`,
  so `demo.py reset` deletes them afterwards (section 16). The password is the demo password you normally use.
  | Login | First name | Used for |
  |---|---|---|
  | `c9-iphone-a@glp1demo.example` | Test A | sections 2 to 5 (install, airplane mode, benchmarks) |
  | `c9-iphone-b@glp1demo.example` | Test B | section 9 (VoiceOver) |
  | `c9-android-c@glp1demo.example` | Test C | section 11a (Android install) |
  | `c9-android-tb@glp1demo.example` | Test TB | section 11b (TalkBack) |
  | `c9-android-d@glp1demo.example` | Test D | section 11c (Android airplane mode) |

---

## 1. Before you start (Laptop, 5 minutes)
1. On the laptop, open `https://eisenhourlabs.github.io/glp1-proto/admin/` and sign in as `brad@glp1demo.example`.
   You should see the Patients list.
2. Tap the **Clinics** tab. You should see a card for **Lakeside (demo)**.
3. Under **Sign-up codes** on that card, write down one code. You should see at least one code; this is what the phone will type.
4. Scroll to the bottom of the admin page. You should see `Version 2026.11.15-…`. Write the version in the table (section 15, row 1).
5. Have your phone charged, on Wi-Fi, and with Do Not Disturb off (so nothing else interrupts the screen reader).

---

## 2. iPhone: install on the home screen and sign in (10 minutes)
1. Open **Safari** (the compass icon). Use Safari, not Chrome, for this section.
2. Type `eisenhourlabs.github.io/glp1-proto/` in the address bar and tap **Go**.
   You should see the sign-in card: "Strength Practice", "Your strength program", Email, Password, **Sign in**, and the
   grey banner "Prototype · demo data only" at the top.
3. Tap **New here? Join with your clinic code**. You should see "Join Strength Practice" and a **Clinic code** box.
4. Type the code from section 1 and tap **Continue**. You should see "Create your account" with Lakeside's name and colour.
5. Fill in First name `Test A`, Email `c9-iphone-a@glp1demo.example`, the password twice, and tap **Create my account**.
   You should see "Creating your account…", then "Signing you in…", then the first onboarding step, "Welcome, Test A".
6. Go through onboarding with any sensible answers. On "A few health questions" answer **No** to every question and type
   `Test A` to confirm. Choose at least 3 days on "Your week". You should see 11 steps in all and end on "You're all set".
7. Tap **See my program**. You should see the home screen: "This week's workouts" and a **Start …** button.
8. Look for the card "Put your program on your home screen". You should see it say: "In Safari, tap the Share button
   (the square with an arrow), then 'Add to Home Screen'." Write in the table whether these words match what your
   Safari actually shows (row 2): on newer iPhones the Share button may be inside the **•••** button at the bottom.
9. Tap the **Share** button (the square with an arrow; if you can't see it, tap **•••** first).
   You should see the share sheet.
10. Scroll down the list and tap **Add to Home Screen**. You should see a preview with the name **Strength** and a green icon.
    If there is an **Open as Web App** switch, leave it on.
11. Tap **Add**. You should see your home screen with the new **Strength** icon (a picture, not a grey letter "S").
12. Tap the **Strength** icon. You should see the app open full screen, with no Safari address bar.
13. You should see the **sign-in card again** inside the app. That is normal on iPhone: the home-screen app keeps its own
    sign-in, separate from Safari.
14. Sign in as `c9-iphone-a@glp1demo.example`. You should see the home screen, and **no** "Put your program on your
    home screen" card (the app knows it is installed).
15. Scroll to the bottom. You should see "Strength programming for your clinic's patients · version 2026.11.15-…".
16. Close the app fully, then tap the icon again. You should see the home screen straight away, still signed in.
17. Tap **Sign out** (top right). You should see the sign-in card.
18. Sign in again as Test A. You should see the home screen.

---

## 3. iPhone: airplane mode in the middle of a workout (C4, 20 minutes)
Stay signed in as Test A, inside the installed app (opened from the icon).
1. On home, tap **Start …** (the first workout's name). You should see "Ready for …?".
2. Tap **Good** under "Energy today", then **Nothing today**. Tap **Start warm-up**. You should see "Warm-up".
3. Tap **Warm-up done**. You should see the first exercise with "Exercise 1 of …" and "Set 1 of …".
4. Log the first set: set the weight with **+** (if the exercise has a weight), leave the reps, tap **Done set**.
   On this very first workout you may see "How was that weight?": tap **About right** (or any answer).
5. Finish this first exercise's sets, then tap **Good** under "How did that feel?". You should see exercise 2.
6. Swipe down from the top-right corner to open Control Center and tap the **airplane**. Check the Wi-Fi icon is grey too
   (if Wi-Fi stays blue, tap it off). Close Control Center.
7. Look at the top of the app, under the header. Within a few seconds you should see the line
   **"You're offline. Your workouts still save on this phone."**
8. Log two sets of exercise 2 and tap **Done set** each time. You should see each set get a tick, and **no** red
   "Not saved yet. Check your connection." message.
9. As soon as a set is logged offline, the line should change to
   **"Saved on this phone. It will sync when you're back online."** Write the exact words in the table (row 7).
10. Tap **I feel dizzy or unwell**. You should see "Stop and sit down" with steps, then the line "No signal right now. The
    program team will be told as soon as your phone is back online. If you need help, contact your clinic."
11. Tap **I feel OK now. Keep going**. You should see the same exercise again.
12. Close the app fully (still in airplane mode). Tap the icon again. You should see the app open (no "Couldn't load"),
    the "Saved on this phone…" line, and on home a **Continue …** button.
13. Tap **Continue …**. You should see the workout open on the exercise you were doing, with your offline sets still ticked.
14. To save time, tap **Skip** on each remaining exercise you haven't started (or log them, if you like).
    You should end on "Last one done!".
15. Tap **Finish workout**. You should see "Quick check-in".
16. Tap **About right**, then **None** for soreness. Leave the note empty. Tap **Save**.
    You should see "Workout done!" (or "Saved. Every part counts!") with "this week" and "weekly streak" tiles.
17. Tap **Back to home**. You should see "Done for today. Rest up, and the next one is ready when you are." and the
    "Saved on this phone…" line still at the top.
18. Open Control Center and turn airplane mode **off** (and Wi-Fi back on). Close Control Center.
19. Wait up to one minute with the app open. You should see the "Saved on this phone…" line disappear.
    If it is still there after a minute, close the app fully and open it again, then write that in the table (row 8).

## 4. Laptop: the workout arrived once (5 minutes)
1. On the laptop's admin page, tap the **Patients** tab, then reload the page.
2. Pick **Lakeside (demo)** in the Clinics filter. You should see **Test A** in the list.
3. Tap **Test A**. Under **Workouts and check-ins** you should see **exactly one** row with today's date, status
   `done`, Felt "About right", Soreness "none". Two rows for today means a workout doubled: write that down (row 9).
4. Under **Flags** you should see **exactly one** dizzy flag from today (from step 3.10). None means it got lost; two means
   it doubled (row 10).

---

## 5. iPhone: the benchmarks feature is off (2 minutes)
The "Quick strength tests" are built but switched off. With them on, a card would show right after her first workout.
1. On the phone (Test A), go to home. You should see **no** card called **"Quick strength tests"** (no "Try them" button,
   no "Draft wording: not yet reviewed.").
2. Tap **Your progress**. You should see three tiles (workouts, weekly streak, best weekly streak) and "Workouts by week".
3. Scroll to the bottom of progress. You should see **no** section called **"Strength tests"**.
4. Tap **Back to home**.

---

## 6. iPhone: the largest text size (10 minutes)
Test A has trained today, so this section uses the demo patient **Lisa** (she has a workout waiting).
`demo.py reset` puts her back afterwards.
1. In the app, tap **Sign out**, then sign in as `lisa@glp1demo.example`. You should see Lisa's home screen.
   (If Lisa shows "Done for today", use `maria@glp1demo.example` instead.)
2. Leave the app. Open **Settings → Accessibility → Display & Text Size → Larger Text**.
3. Turn on **Larger Accessibility Sizes** and drag the slider **all the way to the right**.
4. Go back to the app (tap the icon). Look at home: write in the table (row 12) whether the text got **bigger** or
   **stayed the same**. Note: iPhone may not pass this setting to home-screen web apps at all. "Stayed the same" is a
   useful answer, not your mistake.
5. Whatever happened, check home: you should see no words cut off and no need to scroll sideways.
6. Tap **Start …**, tap **OK**, **Nothing today**, **Start warm-up**, **Warm-up done**. You should see the first exercise.
7. On the exercise screen you should see the **I feel dizzy or unwell** button fully on screen (not cut off at the right
   edge), and the − / + buttons and **Done set** fully visible without scrolling sideways.
8. Scroll down the exercise. You should see the dizzy button **stay at the top** of the screen while you scroll.
9. Tap **I feel dizzy or unwell**. You should see "Stop and sit down" fit the width of the screen. Tap **I feel OK now. Keep going**.
10. Tap **End workout**, then **End workout** again in the box. If you see "Quick check-in", tap **Skip**; then tap
    **Back to home**. (This saves a short partial workout for Lisa; the reset removes it.)
11. Tap **Your progress**. You should see the three tiles and the week rows readable, nothing overlapping.
12. **Now the same in Safari**, which does have its own text size: open Safari, go to the app's address, sign in as Lisa.
13. Tap **aA** (left of the address bar, or in the ••• menu) and tap the big **A** until it says **300%**.
14. Repeat steps 5, 7 to 9 and 11 in Safari (start a workout only if home shows **Start …**; otherwise check home and
    progress). Write what you saw in row 13.
15. Put the text back: in Safari tap **aA** and the small **A** until **100%**; in Settings drag the Larger Text slider
    back to where it was and turn **Larger Accessibility Sizes** off.

## 7. iPhone: dark mode and light mode (5 minutes)
1. Open Control Center, press and hold the brightness slider, tap **Dark Mode** so it is on. (Or Settings → Display &
   Brightness → **Dark**.)
2. Open the app (still Lisa). On home you should see a dark background with light text; every word and button readable.
3. Check, in dark mode: home, **Your progress**, a workout's readiness screen ("Ready for …?", then **Back**).
   The "Prototype · demo data only" banner, grey "muted" text and the green and amber labels should all be easy to read.
4. Turn Dark Mode **off** (light mode). Check the same three screens. Write anything hard to read in rows 14 and 15.

---

## 8. iPhone: a new version arrives (C5, 5 minutes)
This needs a new version to be published. **Merging PR #28 does it** (it changes the version to `2026.11.15-6`).
Do this section right after that merge, once GitHub's "pages build and deployment" is green.
1. On the phone, open the app from the icon. Scroll to the bottom and note the version (for example `2026.11.15-5`).
2. Close the app fully. Open it again from the icon and stay on **home** for up to a minute.
3. You should see a card: **"A new version of the app is ready."** with an **Update now** button.
   If it doesn't come within a minute, close the app fully and open it once more.
4. Tap **Update now**. You should see the app reload by itself, back on home.
5. Scroll to the bottom. You should see the new version, `2026.11.15-6` (or later), and the card should be gone.
6. Start a workout and look: you should **not** see the update card during a workout (it only appears on home).
   Tap **Back** on "Ready for …?" to leave without starting.

---

## 9. iPhone: VoiceOver through onboarding and one workout (C6, 25 minutes)
**Merge PR #28 first** (section 8 confirms the phone has `2026.11.15-6`).

### 9a. Set up a quick on/off switch and learn four gestures
1. Open **Settings → Accessibility → Accessibility Shortcut** and tap **VoiceOver** so it has a tick.
   Now three quick presses of the side button turn VoiceOver on or off. Try it twice: you should hear "VoiceOver on" / "off".
2. With VoiceOver on, practise on the Settings screen:
   - **Swipe right** with one finger: moves to the next item and reads it.
   - **Swipe left**: back one item.
   - **Double-tap** anywhere: presses the item VoiceOver just read.
   - **Three-finger swipe up or down**: scrolls the page.
3. Typing with VoiceOver on is slow. When a step says "type", it is fine to triple-press to turn VoiceOver **off**, type,
   and triple-press to turn it back **on**.

### 9b. Sign up Test B (VoiceOver off for this part)
1. In the app (from the icon), tap **Sign out**. Tap **New here? Join with your clinic code**.
2. Type the clinic code, tap **Continue**, fill in First name `Test B`, Email `c9-iphone-b@glp1demo.example`, the password
   twice, and tap **Create my account**. You should see "Welcome, Test B".
3. Triple-press the side button: VoiceOver **on**.

### 9c. Onboarding with VoiceOver (as in docs/accessibility.md, step 1)
For every step below, the first thing you hear should be **the screen title** (the step's heading), then, as you swipe
right, the text, then the controls. Write anything else in row 18.
1. Without touching, listen. You should hear "Welcome, Test B, heading".
2. Swipe right, one item at a time, to the end. You should hear the welcome text, then **"Let's start, button"**.
   Somewhere near the top you may also hear "Step 1 of 11" (the progress bar).
3. Double-tap on **Let's start**. You should hear **"What your clinic will see, heading"** first (not the bottom of
   the page, not the banner).
4. Swipe right through it. You should hear "Your clinic sees", its list, "Your clinic never sees", its list, the choice
   "I understand what my clinic will see.", and the name box "Type your full name to sign, text field".
5. Double-tap the choice. You should hear that it is now **selected** (VoiceOver may say "selected", or the button again
   with a changed state).
6. Turn VoiceOver off, tap the name box, type `Test B`, turn VoiceOver on. Swipe to **Agree and continue** and double-tap.
   You should hear **"A few health questions, heading"**.
7. Swipe through: each question, then **No** and **Yes** buttons. Double-tap **No** for each. You should hear each
   **No** as selected after you double-tap it.
8. Type `Test B` in the confirm box (VoiceOver off, then on), swipe to **Continue**, double-tap. You should hear
   **"Before you start, heading"** (the waiver).
9. Do the waiver the same way (choice, name, **Agree and continue**). You should hear **"A little about you, heading"**.
10. On each remaining step ("A little about you", "Quick movement check", "Where will you train?", "Anything to work
    around?", "Your week", "What matters most to you?"): listen for the heading first, swipe through, double-tap one
    answer per question, then **Continue**. If you double-tap **Continue** with something missing, you should hear the
    message (for example "Please choose one.") read out without moving.
11. On "You're all set", double-tap **See my program**. You should hear "Building your program…" and then the home
    screen's heading.

### 9d. One workout with VoiceOver (docs/accessibility.md, step 2), plus the steppers and rest timer
1. On home, swipe right until you hear **"Start …, button"**. Double-tap. You should hear **"Ready for …?, heading"**.
2. Swipe to "Energy today" and its choices **Low**, **OK**, **Good**. Double-tap **Good**. You should hear it selected.
3. Swipe to **Nothing today**, double-tap; swipe to **Start warm-up**, double-tap. You should hear **"Warm-up, heading"**.
4. Swipe through the warm-up list, then double-tap **Warm-up done**. You should hear **the exercise name, heading**.
5. Swipe right through the exercise screen. You should hear, in some order: "Exercise 1 of …", "Set 1 of …", the
   weight control ("Lighter", the weight box "Weight in pounds", "Heavier") if the exercise uses weight, then
   "Less reps", the number of reps, "More reps", then **Done set**.
6. **Weight stepper:** double-tap **Heavier**. You should hear the new weight, for example **"10 pounds"**.
   Double-tap **Lighter**. You should hear the lower weight.
7. **Reps stepper:** double-tap **More reps**. You should hear the new number, for example **"11"**. Double-tap
   **Less reps**. You should hear the number go back down.
8. Double-tap **Done set**. On this first exercise you should hear **"How was that weight?, heading"**.
   Double-tap **About right**. You should hear a short note about the weight to use for the next sets, ending with the
   weight (for example "… 10 lb").
9. **Rest timer:** swipe right after the note. You should hear **"Rest, sip some water"** and the time (for example
   "1:30"). Then **stay still for 20 seconds**: you should **not** hear the timer read out every second.
10. Swipe to **+30 s** and **Ready**. Double-tap **Ready**. You should hear **"Set 2 of …"** (focus moves to the next set,
    not back to the top of the page).
11. Log set 2 (double-tap **Done set**). You should hear **"Rest, sip some water"** straight away (focus jumps to the
    rest timer).
12. Let the timer run out on its own (or double-tap **Ready**). You should hear the next set, or after the last set
    **"How did that feel?, heading"**.
13. Double-tap **Good**. You should hear the next exercise's name, heading.
14. **Dizzy button:** three-finger swipe down to the top, swipe to **I feel dizzy or unwell**, double-tap. You should hear
    **"Stop and sit down"** and then its steps as you swipe. Double-tap **I feel OK now. Keep going**. You should be back
    on the **I feel dizzy or unwell** button (VoiceOver reads it).
15. Swipe to **End workout**, double-tap, then **End workout** in the box. You should hear "Quick check-in, heading".
16. Double-tap **About right**, **None**, **Save**. You should hear **"Workout done!"** or **"Saved. Every part counts!"**.
17. Swipe through the tiles. You should hear each number with its words, for example "1 of 3, this week",
    "0, weekly streak", "1, workout total" (not numbers on their own).
18. Double-tap **See progress**. You should hear **"Your progress, heading"**, then tiles named "workouts", "weekly streak",
    "best weekly streak", and week rows like "Week 1, 1 of 3".
19. Triple-press the side button: VoiceOver **off**. Write what sounded wrong or confusing in rows 18 to 22, with the
    screen and the words you heard.

---

## 10. iPhone: error report and health check (A14, 10 minutes)
The phone has no developer console, so this uses a bookmark that throws a test error. If it doesn't work on your phone,
write "skipped" in row 23: the laptop check from PR 11 already proved the server side.
1. **Laptop:** open `glp1-proto\web\config.js` in Notepad and copy the address after `SUPABASE_URL:` (it starts
   `https://` and ends `.supabase.co`). Send it to your phone (for example in a text to yourself).
2. **Phone:** in **Safari**, type that address followed by `/functions/v1/health` and tap **Go**.
   You should see a line of text starting `{"ok":true,"database":"up"`. Write it in row 24.
3. In Safari, open the app's address (signed in as Lisa from section 6, or sign in as her). You should see her home.
4. Tap the **Share** button → **Add Bookmark** → **Save**. You should see a bookmark called "Your strength program…".
5. Text yourself this line exactly, and copy it on the phone:
   `javascript:setTimeout(function(){throw new Error('test error from Troy phone')},0);void 0`
6. Tap the **Bookmarks** button (the open book) → **Edit** → tap the bookmark you just saved.
7. Delete its address and paste the copied line in its place. Tap **Done**, then **Done**.
8. With the app open in Safari, tap **Bookmarks** and tap that bookmark. You should see **nothing happen** on screen.
9. **Laptop:** Supabase → **Table Editor** → `client_errors`, reload. Within a minute you should see a row with message
   `Error: test error from Troy phone`, app `patient`, role `patient`, a page path and the version.
10. Check that row has **no email, no name and no address** in any column. Write the result in row 23.
11. Phone: delete the bookmark (Bookmarks → Edit → swipe left on it → **Delete**).

---

## 11. Android phone (only if you have one)
Use **Chrome**. Steps that are the same as the iPhone say "as in section …".

### 11a. Install and sign in (10 minutes)
1. Open **Chrome**, go to `eisenhourlabs.github.io/glp1-proto/`. You should see the sign-in card.
2. Tap **New here? Join with your clinic code** and create **Test C** (`c9-android-c@glp1demo.example`) as in section 2,
   steps 3 to 7. You should end on the home screen.
3. Look for the card "Put your program on your home screen". You should see **either** a green **Add to home screen**
   button **or** the words "In Chrome, tap the ⋮ menu, then 'Add to Home screen' or 'Install app'." Write which, and
   whether the words match your Chrome menu (row 26).
4. Tap **Add to home screen** (or ⋮ → **Add to Home screen** / **Install app**), then **Install** or **Add**.
   You should see the Strength icon on the home screen (maybe after a few seconds).
5. Tap the icon. You should see the app full screen without Chrome's address bar, **still signed in** as Test C
   (on Android the installed app shares Chrome's sign-in), and no install card.
6. Close the app fully, open it from the icon. You should still be signed in.
7. Scroll to the bottom: note the version.

### 11b. TalkBack through onboarding and one workout (25 minutes)
1. Turn on the shortcut: **Settings → Accessibility → TalkBack → TalkBack shortcut** on. Now holding **both volume keys
   for 3 seconds** turns TalkBack on or off. (Names differ a little by phone make.)
2. TalkBack gestures: **swipe right** = next item, **swipe left** = back, **double-tap** = press, **two-finger swipe**
   up or down = scroll. As on iPhone, it is fine to turn TalkBack off to type.
3. With TalkBack off, tap **Sign out**, tap **New here? Join with your clinic code** and join as **Test TB**
   (`c9-android-tb@glp1demo.example`). You should see "Welcome, Test TB".
4. Turn TalkBack on at "Welcome, Test TB". Do section 9c steps 1 to 11 and section 9d steps 1 to 18 with TalkBack.
   Expect the same words; TalkBack says choices as "selected"/"not selected" or "on"/"off", and headings as "heading".
5. Turn TalkBack off. Write findings in rows 27 to 30.

### 11c. Airplane mode (15 minutes)
1. Sign out; join as **Test D** (`c9-android-d@glp1demo.example`) and finish onboarding.
2. Do section 3 steps 1 to 19. Airplane mode is in the quick settings: swipe down twice from the top and tap
   **Airplane mode**; make sure Wi-Fi is off too.
3. Do section 4 for **Test D** on the laptop (exactly one workout row today, exactly one dizzy flag). Row 31.

### 11d. Largest text and dark mode (10 minutes)
1. Sign in as Lisa (or Maria). **Settings → Display → Font size** (and **Display size**, if there is one): drag both
   all the way to the largest.
2. Open the app. You should see the text clearly bigger. Do section 6 steps 5 to 11. Row 32.
3. Put the sizes back.
4. Quick settings → **Dark theme** on. Do section 7 steps 2 to 4. Row 33.

---

## 12. Not repeated on Android
The update notice (section 8) and the error bookmark (section 10) only need one phone. The health address
(section 10 step 2) is worth opening in Chrome too: same expected text.

## 13. Anything else
If anything in the app surprised you that this list doesn't cover, write it in row 35 with the screen you were on.

## 14. Seven days later (iPhone, 2 minutes)
Don't open the app for 7 days after section 2, then:
1. Tap the **Strength** icon. You should see Test A's home **still signed in** (no sign-in card), with today's date
   making sense (the week shows the right workouts).
2. If you see the sign-in card instead, sign in and write "signed out after 7 days" in row 34.

---

## 15. Results
Copy this table into a note or the chat and fill in each row: **pass**, **fail** or **skipped**, and what you saw
(the words on screen or what the screen reader said). For a fail, the exact words help most.

| # | Check | Pass / fail / skipped | What I saw |
|---|---|---|---|
| 1 | Version shown in admin before starting (1.4) | | |
| 2 | iPhone install card wording matches Safari (2.8) | | |
| 3 | Icon is a picture, name "Strength" (2.11) | | |
| 4 | Opens full screen from the icon; sign-in needed once inside the app (2.12–2.14) | | |
| 5 | Still signed in after closing and reopening (2.16) | | |
| 6 | "You're offline…" line appears in airplane mode (3.7) | | |
| 7 | Sets log offline, "Saved on this phone…" line, exact words (3.8–3.9) | | |
| 8 | App reopens offline and the workout continues (3.12–3.13); line clears when back online (3.19) | | |
| 9 | Admin: exactly one workout row for Test A today (4.3) | | |
| 10 | Admin: exactly one dizzy flag for Test A today (4.4) | | |
| 11 | No "Quick strength tests" card on home, no "Strength tests" on progress (5) | | |
| 12 | iPhone Larger Text: did the app's text get bigger? (6.4) | | |
| 13 | Large text: nothing sideways, dizzy button on screen and stays at top (6.5–6.11, Safari 300% 6.14) | | |
| 14 | Dark mode: everything readable (7.2–7.3) | | |
| 15 | Light mode: everything readable (7.4) | | |
| 16 | "A new version of the app is ready." appears on home, not during a workout (8.3, 8.6) | | |
| 17 | "Update now" reloads to the new version (8.4–8.5) | | |
| 18 | VoiceOver onboarding: each step's title heard first; choices say selected (9c) | | |
| 19 | VoiceOver: weight "Heavier"/"Lighter" say the new weight; reps steppers say the number (9d.6–9d.7) | | |
| 20 | VoiceOver: rest timer read once, not every second; focus goes to it after Done set (9d.9, 9d.11) | | |
| 21 | VoiceOver: "Ready" moves to the next set (9d.10, 9d.12) | | |
| 22 | VoiceOver: dizzy sheet, check-in, reward tiles, progress read sensibly (9d.14–9d.18) | | |
| 23 | Error report from the phone lands in `client_errors`, no personal details (10.9–10.10) | | |
| 24 | Health address shows `"ok":true,"database":"up"` (10.2) | | |
| 25 | (Android) Health address in Chrome (12) | | |
| 26 | (Android) Install card: button or words; words match Chrome (11a.3) | | |
| 27 | (Android) Installs, opens full screen, stays signed in (11a.4–11a.6) | | |
| 28 | (Android) TalkBack onboarding: titles first, choices state (11b.4) | | |
| 29 | (Android) TalkBack: steppers, rest timer, Ready (11b.4) | | |
| 30 | (Android) TalkBack: dizzy, check-in, progress (11b.4) | | |
| 31 | (Android) Airplane mode: logs offline, arrives exactly once (11c) | | |
| 32 | (Android) Largest font: text bigger, nothing sideways, dizzy button on screen (11d.2) | | |
| 33 | (Android) Dark theme readable (11d.4) | | |
| 34 | iPhone still signed in after 7 days unused (14) | | |
| 35 | Anything else (13) | | |

Phone models and system versions (Settings → General → About → iOS Version; Android: Settings → About phone):
- iPhone: ______ , iOS ______
- Android: ______ , Android ______ , Chrome ______

## 16. Send these to Claude
Open a new chat in the **GLP1 Idea** project and paste:

> C9 phone check results. Please read docs/device_checks.md and 03_Status_and_Handoff.md, then fix what failed
> (one small PR per problem, same rules as always) and record the results in docs/device_checks.md.
> [paste the filled-in table, the phone models, and any screenshots]

Screenshots help: on iPhone press the side button and volume-up together; on Android power and volume-down.
Afterwards, on the laptop, run `demo.py reset` (in PowerShell, in the `glp1-proto` folder:
`.venv\Scripts\python.exe scripts\demo.py reset`) to delete the test logins and put Lisa back before the next walkthrough.

## Results so far
Not run yet. (Claude records the results here after Troy sends the table.)
