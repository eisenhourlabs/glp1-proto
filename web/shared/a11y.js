// Small accessibility helpers shared by the three apps (backlog C6).
//
// The page no longer sits inside one big aria-live region (a screen reader would read every redraw). Instead, status
// lines carry role="status" (statusLine() in ui.js) and each new screen moves focus to its heading, which the screen
// reader then announces. Focus is moved without scrolling; the caller scrolls to the top itself when it should.

/** Put focus on the first heading in `scope` (h1, else h2) so a screen reader announces the new screen. */
export function focusHeading(scope = document.getElementById('app')) {
  const heading = scope?.querySelector?.('h1') ?? scope?.querySelector?.('h2');
  if (!heading) return false;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');   // focusable by script, not by Tab
  heading.focus({ preventScroll: true });
  return true;
}

/** A new screen is on show: back to the top, and announce it. Call after the screen's content is in the page. */
export function screenChange(scope) {
  window.scrollTo?.(0, 0);
  return focusHeading(scope);
}
