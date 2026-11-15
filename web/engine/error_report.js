// Error reports (backlog A14): turn what the browser knows about a failure into something safe to store. The apps call
// cleanReport() before sending and the client-error Edge Function calls it again before storing, so a modified client
// can't get more through than the apps do. No person is identified: no user id, no address, no query string, and the
// scrub below removes emails, ids, phone numbers, tokens and long quoted text from the error text itself.
// Best effort by design: the apps put their text in with textContent and never put typed text in an error on purpose.

export const APPS = ['patient', 'admin', 'clinic', 'join'];
export const ROLES = ['patient', 'admin', 'clinic_viewer'];
export const LIMITS = { message: 300, stack: 2000, path: 200, version: 40, stackLines: 12, body: 8000 };

const EMAIL = /[^\s@<>()"'`]+@[^\s@<>()"'`]+\.[A-Za-z]{2,}/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g;
const PHONE = /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const LONG_NUMBER = /\b\d{6,}\b/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const ORIGIN = /\b(?:https?|wss?):\/\/[^/\s)'"]+/g;
const QUERY_OR_HASH = /[?#][^\s:)'"]*/g;
const QUOTED = /(["'`])((?:(?!\1).){25,})\1/g;               // a long quoted run is probably someone's own words
const ANY_QUOTED = /(["'`])(?:(?!\1).)+\1/g;

/** Remove anything that could identify a person from a piece of error text. */
export function scrub(text) {
  return String(text ?? '')
    .replace(ORIGIN, '')
    .replace(QUERY_OR_HASH, '')
    .replace(EMAIL, '[email]')
    .replace(JWT, '[token]')
    .replace(UUID, '[id]')
    .replace(PHONE, '[phone]')
    .replace(LONG_NUMBER, '[n]')
    .replace(LONG_TOKEN, '[token]');
}

function cleanMessage(raw) {
  let m = scrub(typeof raw === 'string' ? raw : '').replace(/\s+/g, ' ').trim();
  // A JSON parse error quotes the start of the text it choked on, which could be anything she typed.
  m = /valid JSON|Unexpected (?:token|character|end)|JSON\.parse/i.test(m) ? m.replace(ANY_QUOTED, '[text]') : m.replace(QUOTED, '[text]');
  return m.slice(0, LIMITS.message);
}

function cleanStack(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const lines = raw.split('\n').slice(0, LIMITS.stackLines).map((l) => scrub(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  return lines.join('\n').slice(0, LIMITS.stack) || null;
}

/** A page path without its query or hash; ids in it become placeholders. */
export function cleanPath(raw) {
  let p = String(raw ?? '/').split(/[?#]/)[0] || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(UUID, ':id').replace(/\/\d{4,}(?=\/|$)/g, '/:n');
  return p.slice(0, LIMITS.path);
}

/** Errors that say nothing about the app: the phone's own network, the browser, extensions. */
export function isNoise(message = '', stack = '') {
  return /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|AbortError|The operation was aborted|Failed to fetch|Load failed|NetworkError|network error|The network connection was lost|^$/i.test(message)
    || /(?:chrome|moz|safari|safari-web)-extension:\/\//.test(stack);
}

/**
 * raw: { app, role, message, stack, path, version } as the page or the Edge Function received it (anything may be wrong).
 * @returns {{ app, role, message, stack, path, version } | null} null when it isn't a usable report or is just noise
 */
export function cleanReport(raw) {
  if (!raw || typeof raw !== 'object' || !APPS.includes(raw.app)) return null;
  const message = cleanMessage(raw.message);
  const stack = cleanStack(raw.stack);
  if (isNoise(message, typeof raw.stack === 'string' ? raw.stack : '')) return null;
  const version = typeof raw.version === 'string' && /^[\w.-]{1,40}$/.test(raw.version) ? raw.version : 'unknown';
  return { app: raw.app, role: ROLES.includes(raw.role) ? raw.role : null, message, stack, path: cleanPath(raw.path), version };
}

/** What makes two reports "the same error" inside one page (the browser sends each only once). */
export const reportKey = (r) => `${r.message}|${(r.stack ?? '').split('\n')[0]}`;
