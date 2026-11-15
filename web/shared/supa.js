// Supabase client + auth helpers shared by every entry page.
// supabase-js is self-hosted in web/vendor/ (pinned; rebuilt by scripts/vendor.sh, versions in docs/setup.md).
import { createClient } from '../vendor/supabase-js.js';
import { CONFIG, isConfigured } from '../config.js';
import { remember, clearReads } from './offline.js';

// Root of the web app (the folder holding index.html), wherever it is hosted.
export const APP_ROOT = new URL('../', import.meta.url);

export const db = isConfigured()
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storageKey: `${CONFIG.STORAGE_PREFIX}.auth`,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function getSession() {
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data.session ?? null;
}

// The signed-in user's profile row (role, clinic, name), or null.
export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  // Saved on the phone too, so the patient app opens without a signal (C4).
  const data = await remember(`${session.user.id}:profile`, async () => {
    const { data: row, error } = await db
      .from('profiles')
      .select('id, role, clinic_id, display_name, is_demo, clinics ( name, short_name, accent_color, logo_path )')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    return row;
  });
  return data ? { ...data, email: session.user.email } : { id: session.user.id, email: session.user.email, role: null };
}

export async function signIn(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await clearReads().catch(() => {});        // her saved copies leave with her; unsent workouts wait for her next sign-in
  await db.auth.signOut();
}

// Self-serve password reset: Supabase emails a one-time, short-expiry link.
export async function sendPasswordReset(email) {
  const redirectTo = new URL('reset.html', APP_ROOT).href;
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// Where each role belongs.
export const HOME_FOR_ROLE = {
  patient: '',
  admin: 'admin/',
  clinic_viewer: 'clinic/',
};

export const homeUrl = (role) => new URL(HOME_FOR_ROLE[role] ?? '', APP_ROOT).href;
