# Accessibility (backlog C6)

Last reviewed: sprint 1 PR 11, 2026-11-15. Target: WCAG 2.2 AA for the patient app, and the same colours and structure in the
admin and clinic pages.

## What is checked automatically (every pull request)
| Check | Where | What it covers |
|---|---|---|
| axe-core scan | every browser smoke (`A11Y_REPORT`), summarized by `scripts/a11y_report.mjs`; CI job `browser` | Serious and critical issues on every screen the smokes visit (about 120 screens: onboarding, home, workout, review, progress, admin, clinic, join, sign-in). Any new serious or critical issue fails the build. `tests/browser/a11y_known.json` lists issues allowed to pass while they are fixed: **empty since C6** |
| Colour contrast of every token pair, light and dark | `tests/contrast.test.js` | Text, muted text, links, buttons, status pills and the check marks against their backgrounds, at 4.5:1 or better. Clinic accent colours are chosen per clinic and are not checked |
| No page-wide live region; zoom allowed; page language set | `tests/a11y_static.test.js` | `<main>` is not `aria-live`; no page disables pinch-zoom; `lang="en"` |
| Focus, controls, tiles, text size | `tests/browser/a11y.smoke.mjs` | Each new screen moves focus to its heading; the "I feel dizzy or unwell" control is at least 48 px high and stays on screen at 200% text; the progress tiles and weekly rows say what they count; nothing scrolls sideways at 200% text |

## What changed in C6
- **No more page-wide live region.** `<main>` was `aria-live="polite"`, so a screen reader announced every redraw. Status
  lines (`role="status"`: form messages, the "saved on this phone" line, the update notice, the rest-of-workout toast) are now
  the only live regions.
- **Focus moves to each new screen's heading** (`web/shared/a11y.js`): every onboarding step, the readiness screen, the
  warm-up, each exercise, the check-in and reward screens, the progress screen, the cycle review steps, the join page steps and
  each admin page. A bottom sheet (swap, "Something hurts", dizzy, "Rough week?") gives focus back to the button that opened it.
- **Weekly charts have text.** The patient progress weeks show "2 of 3" next to the dots; the clinic dashboard bars were
  hidden from screen readers by `role="img"` and now read "Week of Nov 2: 78% of planned workouts done".
- **The dizzy control** is a full 48 px button at the normal button text size (it was 40 px with small text).
- **Progress tiles** no longer show three identical numbers. They are now *workouts*, *weekly streak* and *best weekly streak*.
  The streak was counting workouts. The weekly streak counts the weeks she finished every planned workout; one missed week
  is forgiven, two in a row start it again (`web/engine/week_streak.js`).
- **Colour contrast.** Admin status pills (green and amber text on a tint) were 3.9 to 4.2:1; the green and amber tokens and
  the muted text colour are darker in the light theme (now 4.7 to 6:1), and the check marks on green use the theme's ink colour
  (they were white on light green in the dark theme, 2:1).
- **Text size.** Body text is in `rem`, so a larger text-size setting in the browser or phone scales the whole app. Tiles
  and buttons reflow; the small text links have a 44 px tap area.

## Screen-reader review of onboarding and one workout
**What was done here (no screen reader available to the builder):** the browser's accessibility tree was read
(`Locator.ariaSnapshot()` in Playwright) for the first two onboarding steps (welcome, "What your clinic will see") and the
workout's readiness, warm-up and exercise screens. The other onboarding steps use the same step component and are covered
by the axe scan, not read one by one. Findings:
- Each screen has one `h1` that names it ("Welcome, Dana", "What your clinic will see", "Ready for Full body A?", the exercise
  name), sub-sections are `h2`, lists are real lists, every button has a name, and the step progress bar is a `progressbar`
  named "Step 2 of 11". Focus lands on the `h1`, so a screen reader reads the new screen's title first.
- Inputs and steppers have names (the typed-name signature field, "Less reps" / "More reps", "Weight in pounds"). Choices
  expose `aria-pressed` inside a named radio group or group; the energy question is a `radiogroup` of buttons.
- Nothing else in the page is announced when it redraws.

**Still to do (Troy, with a real screen reader; part of the C9 phone check):** this is the acceptance step the tree review can't replace.
1. iPhone: Settings → Accessibility → VoiceOver on. Open the app from the home screen. Sign in as a demo patient who is in
   onboarding (or use a new join code). Swipe through each step: you should hear the screen title first, then the text, then the
   controls. Choose options and listen for "selected"/"not selected".
2. Start a workout. Listen to the warm-up, one exercise (weight stepper, "Done set", the rest timer) and the dizzy button.
   Check the rest timer isn't announced every second.
3. Android: TalkBack, same path.
4. Write anything that sounds wrong or confusing in `docs/device_checks.md` (C9), with the screen and what you heard.

## 200% text
Checked in the browser smoke at 200% text size on the exercise screen, the dizzy sheet, home and progress: no sideways
scrolling, the dizzy control stays on screen. Not tested on a real phone with the OS text size at its largest (C9).

## Known gaps
- Clinic accent colours are free choices; a very light accent would make the main button's white text hard to read. A contrast check when a
  clinic colour is set (admin) is not built.
- The rest timer (`role="timer"`) and set steppers (`aria-live` on the value) have not been listened to on a real screen reader
  (C9, `docs/device_checks.md`). Fixed before that check (found while writing it): "Heavier"/"Lighter" now say the new weight
  ("15 pounds"), and after "Done set" focus moves to the rest timer (or the next set, or "How did that feel?") instead of
  being lost when the button leaves the page; after "Ready" it moves to the next set.
- "Sign out moves into the menu" waits for the patient menu (A10).
