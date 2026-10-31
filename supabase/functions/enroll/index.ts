// Edge Function `enroll`: a patient signs herself up with her clinic's code (Brad's hard requirement).
//
// Deploy (no CLI needed): Supabase → Edge Functions → Deploy a new function → Via Editor → name it `enroll` →
// paste this whole file → Deploy. Then in the function's Details, turn OFF "Verify JWT" (the page calls it with the
// publishable key, which is not a JWT). See docs/supabase_settings.md.
//
// Public sign-up stays OFF in Supabase Auth: this function is the only way in. It checks the code is active, creates
// the login (pre-confirmed), and adds her profile (role patient, the code's clinic) and her program row. If any step
// fails it removes the login again, so there are never half-made accounts. No environment values live here: the
// project URL and secret key are injected by Supabase.
//
// Keep the checks in step with web/shared/enroll_rules.js (the page checks the same things first).

import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const CORS = {
  'Access-Control-Allow-Origin': '*',                    // public endpoint, no cookies; any page may call it
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const CODE_RE = /^[A-Z0-9-]{4,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const first = keys.default ?? Object.values(keys)[0];
    if (first) return String(first);
  } catch { /* fall back to the legacy key */ }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('no secret key available');
  return legacy;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? '').trim().toUpperCase();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  const name = String(body?.name ?? '').trim();
  if (!CODE_RE.test(code)) return json({ error: 'code' }, 400);
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'email' }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: 'password' }, 400);
  if (name.length < 1 || name.length > 80) return json({ error: 'name' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: k, error: codeErr } = await admin.from('clinic_codes')
    .select('clinic_id, active, expires_at, clinics ( status )').eq('code', code).maybeSingle();
  if (codeErr) return json({ error: 'server' }, 500);
  const clinicOk = k && k.active && (!k.expires_at || new Date(k.expires_at) > new Date())
    && (k as { clinics?: { status?: string } }).clinics?.status === 'active';
  if (!clinicOk) return json({ error: 'code' }, 400);

  const { data: created, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (userErr || !created?.user) {
    const msg = (userErr?.message ?? '').toLowerCase();
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) return json({ error: 'exists' }, 409);
    if (msg.includes('password')) return json({ error: 'password' }, 400);
    return json({ error: 'server' }, 500);
  }
  const uid = created.user.id;

  const { error: pErr } = await admin.from('profiles').insert({ id: uid, role: 'patient', clinic_id: k!.clinic_id, display_name: name });
  const { error: ptErr } = pErr ? { error: pErr } : await admin.from('patients').insert({ id: uid });
  if (pErr || ptErr) {
    await admin.auth.admin.deleteUser(uid);            // never leave a login without a profile
    return json({ error: 'server' }, 500);
  }
  return json({ ok: true });
});
