// Sign-up checks shared by the join page (the enroll Edge Function repeats them on the server).

export const CODE_RE = /^[A-Z0-9-]{4,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeCode = (c) => String(c ?? '').trim().toUpperCase();

/** Returns a plain-language problem, or '' when the form is fine. */
export function checkSignup({ name, email, password, confirm }) {
  if (!String(name ?? '').trim()) return 'Please enter your first name.';
  if (String(name).trim().length > 80) return 'That name is too long.';
  if (!EMAIL_RE.test(String(email ?? '').trim())) return 'Please enter a valid email address.';
  if (String(password ?? '').length < 8) return 'Your password needs at least 8 characters.';
  if (String(password).length > 72) return 'That password is too long.';
  if (password !== confirm) return 'The two passwords don’t match.';
  return '';
}

/** Plain-language message for an error code from the enroll function. */
export const ENROLL_ERRORS = {
  code: 'That clinic code isn’t active. Please check it with your clinic.',
  email: 'Please enter a valid email address.',
  password: 'Your password needs at least 8 characters.',
  name: 'Please enter your first name.',
  exists: 'That email already has an account. Try signing in instead, or use “Forgot password”.',
  server: 'Something went wrong on our side. Please try again in a minute.',
};

/** The join link for a clinic code, relative to the app's base URL. */
export const joinLink = (baseHref, code) => new URL(`join.html?code=${encodeURIComponent(normalizeCode(code))}`, baseHref).href;
