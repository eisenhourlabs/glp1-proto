// Small accessibility helpers shared by the three apps (backlog C6).
//
// The page no longer sits inside one big aria-live region (a screen reader would read every redraw). Instead, status
// lines carry role="status" (statusLine() in ui.js) and each new screen moves focus to its heading, which the screen
// reader then announces. Focus is moved without scrolling; the caller scrolls to the top itself when it should.

/** Move focus to `el` (made focusable by script, not by Tab) so a screen reader reads it. False when there is no el. */
export function focusOn(el) {
  if (!el?.focus) return false;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  return true;
}

/** Put focus on the first heading in `scope` (h1, else h2) so a screen reader announces the new screen. */
export function focusHeading(scope = document.getElementById('app')) {
  return focusOn(scope?.querySelector?.('h1') ?? scope?.querySelector?.('h2'));
}

/** A new screen is on show: back to the top, and announce it. Call after the screen's content is in the page. */
export function screenChange(scope) {
  window.scrollTo?.(0, 0);
  return focusHeading(scope);
}
