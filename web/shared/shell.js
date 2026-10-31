// Page shell: demo banner, sign-in form, role gate. Each entry page calls mountShell().
import { CONFIG, isConfigured } from '../config.js';
import { db, getProfile, signIn, signOut, sendPasswordReset, homeUrl } from './supa.js';
import { h, clear } from './dom.js';

/**
 * @param {object} opts
 * @param {string} opts.title           page title shown in the header
 * @param {string[]} opts.allowedRoles  roles allowed on this page
 * @param {(profile:object, root:HTMLElement) => void|Promise<void>} opts.render
 */
export async function mountShell({ title, allowedRoles, render }) {
  document.title = `${title} · ${CONFIG.BRAND_NAME}`;
  const root = document.getElementById('app');
  if (CONFIG.DEMO_BANNER) document.body.prepend(h('div', { class: 'demo-banner' }, 'Prototype · demo data only'));

  if (!isConfigured()) {
    clear(root).append(card('Not configured yet', 'Add the Supabase URL and publishable key to web/config.js.'));
    return;
  }

  const show = async () => {
    let profile = null;
    try { profile = await getProfile(); } catch (e) { console.error(e); }
    if (!profile) return renderSignIn(root, title, show);
    if (!profile.role) {
      return clear(root).append(card('Account not set up yet',
        'Your login works, but your account has not been set up. Please contact the program team.', signOutButton()));
    }
    if (!allowedRoles.includes(profile.role)) {
      location.replace(homeUrl(profile.role));
      return;
    }
    applyClinicAccent(profile);
    clear(root);
    await render(profile, root);
  };

  db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') renderSignIn(root, title, show);
  });
  await show();
}

function renderSignIn(root, title, onSignedIn) {
  const email = h('input', { type: 'email', id: 'email', autocomplete: 'email', required: true });
  const pw = h('input', { type: 'password', id: 'password', autocomplete: 'current-password', required: true });
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const form = h('form', { class: 'stack', novalidate: true },
    h('label', { for: 'email' }, 'Email'), email,
    h('label', { for: 'password' }, 'Password'), pw,
    h('button', { type: 'submit', class: 'btn btn-primary' }, 'Sign in'),
    h('button', { type: 'button', class: 'btn btn-link', onclick: async () => {
      if (!email.value) { msg.textContent = 'Enter your email first, then tap “Forgot password”.'; return; }
      try { await sendPasswordReset(email.value.trim()); msg.textContent = 'If that email has an account, a reset link is on its way.'; }
      catch (e) { msg.textContent = 'Could not send the reset email. Please try again in a minute.'; }
    } }, 'Forgot password?'),
    msg,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = 'Signing in…';
    try { await signIn(email.value.trim(), pw.value); msg.textContent = ''; await onSignedIn(); }
    catch (err) { msg.textContent = 'That email and password didn’t match. Please try again.'; }
  });
  clear(root).append(h('section', { class: 'card narrow' },
    h('h1', {}, CONFIG.BRAND_NAME), h('p', { class: 'muted' }, title), form));
}

export function signOutButton() {
  return h('button', { class: 'btn btn-quiet', onclick: () => signOut() }, 'Sign out');
}

function card(heading, text, ...extra) {
  return h('section', { class: 'card narrow' }, h('h1', {}, heading), h('p', {}, text), ...extra);
}

function applyClinicAccent(profile) {
  const accent = profile?.clinics?.accent_color;
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--clinic-accent', accent);
}
