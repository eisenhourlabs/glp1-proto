// Browser error capture (backlog A14): script errors and unhandled promise rejections go to the `client-error` Edge
// Function, which stores each distinct error once with a count. Installed by every page: the three apps through
// mountShell() and the join page directly.
//
// What is sent: the app name, her role (patient/admin/clinic_viewer, or nothing before sign-in), the error text and call
// stack, the page path without its query, and the app version. Never a user id, an address or anything she typed; the
// cleaning is in engine/error_report.js and runs again on the server. It is best effort: nothing here may ever throw,
// block the page or report while the phone is offline (offline errors are noise and the report would not arrive).
import { CONFIG, APP_VERSION, isConfigured } from '../config.js';
import { cleanReport, reportKey } from '../engine/error_report.js';

const MAX_PER_PAGE = 5;            // a page that is stuck in a loop can't flood the endpoint
const state = { app: null, role: null, installed: false, sent: 0, seen: new Set() };

export function setErrorRole(role) { state.role = role ?? null; }

/** Report an error by hand (the global handlers call this too). Returns true when a report was sent. */
export function reportError(err) {
  try {
    if (!CONFIG.ERROR_REPORTING || !isConfigured() || !state.app) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const e = err instanceof Error ? err : null;
    const report = cleanReport({
      app: state.app, role: state.role, version: APP_VERSION,
      message: e ? `${e.name}: ${e.message}` : typeof err === 'string' ? err : '',
      stack: e?.stack ?? '',
      path: globalThis.location?.pathname ?? '/',
    });
    if (!report) return false;
    const key = reportKey(report);
    if (state.seen.has(key) || state.sent >= MAX_PER_PAGE) return false;
    state.seen.add(key); state.sent += 1;
    fetch(`${CONFIG.SUPABASE_URL}/functions/v1/client-error`, {
      method: 'POST', keepalive: true, mode: 'cors', credentials: 'omit',
      headers: { 'content-type': 'text/plain;charset=UTF-8', apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(report),
    }).catch(() => {});
    return true;
  } catch { return false; }
}

/** Start capturing (once per page). app: 'patient' | 'admin' | 'clinic' | 'join'. */
export function installErrorReporting(app) {
  if (state.installed || typeof window === 'undefined') return;
  state.installed = true; state.app = app;
  window.addEventListener('error', (ev) => {
    if (ev.target && ev.target !== window) return;                 // a failed image or script tag, not a script error
    reportError(ev.error ?? (typeof ev.message === 'string' ? ev.message : ''));
  });
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason));
}
