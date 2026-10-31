// Self-enrollment: a patient joins with her clinic's code (from the link or typed), then lands in onboarding.
// The account is created by the `enroll` Edge Function; open sign-up stays off in Supabase Auth.
import { CONFIG, isConfigured } from './config.js';
import { db, signIn, getSession } from './shared/supa.js';
import { h, clear } from './shared/dom.js';
import { primary, statusLine } from './shared/ui.js';
import { CODE_RE, normalizeCode, checkSignup, ENROLL_ERRORS } from './shared/enroll_rules.js';

const root = document.getElementById('app');
if (CONFIG.DEMO_BANNER) document.body.prepend(h('div', { class: 'demo-banner' }, 'Prototype · demo data only'));

const field = (label, attrs) => {
  const input = h('input', attrs);
  return { input, el: h('label', { class: 'stack' }, h('span', {}, label), input) };
};

async function branding(code) {
  if (!CODE_RE.test(code)) return null;
  const { data, error } = await db.rpc('clinic_branding_for_code', { p_code: code });
  if (error) throw error;
  return data?.[0] ?? null;
}

function codeStep(prefill = '', problem = '') {
  const code = field('Clinic code', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', maxlength: 24, value: prefill });
  const msg = statusLine();
  msg.textContent = problem;
  clear(root).append(h('section', { class: 'card narrow' },
    h('h1', {}, `Join ${CONFIG.BRAND_NAME}`),
    h('p', { class: 'muted' }, 'Enter the code from your clinic’s card or email.'),
    h('div', { class: 'stack' }, code.el, msg, primary('Continue', async () => {
      const c = normalizeCode(code.input.value);
      msg.textContent = 'Checking…';
      try { const b = await branding(c); if (!b) { msg.textContent = ENROLL_ERRORS.code; return; } formStep(c, b); }
      catch (e) { console.error(e); msg.textContent = 'Couldn’t check the code. Check your connection.'; }
    })),
    h('p', { class: 'small center' }, h('a', { href: './' }, 'Already joined? Sign in'))));
}

function formStep(code, b) {
  if (b.accent_color && /^#[0-9a-f]{6}$/i.test(b.accent_color)) document.documentElement.style.setProperty('--clinic-accent', b.accent_color);
  const name = field('First name', { type: 'text', autocomplete: 'given-name', maxlength: 80 });
  const email = field('Email', { type: 'email', autocomplete: 'email', inputmode: 'email' });
  const pw = field('Choose a password (8+ characters)', { type: 'password', autocomplete: 'new-password' });
  const pw2 = field('Type it again', { type: 'password', autocomplete: 'new-password' });
  const msg = statusLine();
  const submit = primary('Create my account', async () => {
    const v = { name: name.input.value.trim(), email: email.input.value.trim(), password: pw.input.value, confirm: pw2.input.value };
    const problem = checkSignup(v);
    if (problem) { msg.textContent = problem; return; }
    submit.disabled = true;
    msg.textContent = 'Creating your account…';
    try {
      const { error } = await db.functions.invoke('enroll', { body: { code, name: v.name, email: v.email, password: v.password } });
      if (error) {
        const detail = await error.context?.json?.().catch(() => null);
        msg.textContent = ENROLL_ERRORS[detail?.error] ?? ENROLL_ERRORS.server;
        submit.disabled = false;
        return;
      }
      msg.textContent = 'Signing you in…';
      await signIn(v.email, v.password);
      location.replace('./');
    } catch (e) {
      console.error(e);
      msg.textContent = ENROLL_ERRORS.server;
      submit.disabled = false;
    }
  });
  clear(root).append(h('section', { class: 'card narrow' },
    h('p', { class: 'eyebrow' }, b.clinic_name),
    h('h1', {}, 'Create your account'),
    h('p', { class: 'muted' }, `${b.clinic_name} offers this strength program to its patients. It takes about a minute.`),
    h('div', { class: 'stack' }, name.el, email.el, pw.el, pw2.el, msg, submit),
    h('p', { class: 'small muted' }, 'Your clinic never sends us your information. You sign up yourself, and you’ll see exactly what your clinic can see before you start.'),
    h('p', { class: 'small center' }, h('a', { href: './' }, 'Already joined? Sign in'))));
}

async function start() {
  if (!isConfigured()) { clear(root).append(h('section', { class: 'card narrow' }, h('h1', {}, 'Not configured yet'))); return; }
  if (await getSession()) { location.replace('./'); return; }
  const code = normalizeCode(new URLSearchParams(location.search).get('code'));
  if (!code) return codeStep();
  try {
    const b = await branding(code);
    if (b) formStep(code, b); else codeStep(code, ENROLL_ERRORS.code);
  } catch (e) { console.error(e); codeStep(code, 'Couldn’t check the code. Check your connection.'); }
}
start();
