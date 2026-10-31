// The ONLY place environment-specific values live in the web app.
// Moving to new accounts = edit this file (and the .env used by scripts). Nothing else.
//
// SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are public by design (the browser needs them);
// row-level security in the database is what protects data. Never put a secret/service key here.

export const CONFIG = Object.freeze({
  ENV: 'prototype',                       // 'prototype' | 'staging' | 'production'
  SUPABASE_URL: 'https://xfkwcobapjbeczoxffjf.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_NEkzAeKoGw0Tamlp54ufKA_sNamsRFI', // publishable key (public by design)
  BRAND_NAME: 'Strength Practice',        // placeholder until the product is named
  STORAGE_PREFIX: 'glp1proto',            // prefixes localStorage keys, IndexedDB and caches
  DEMO_BANNER: true,                      // shows "Prototype — demo data only"
});

export const isConfigured = () =>
  !CONFIG.SUPABASE_URL.includes('REPLACE_ME') &&
  !CONFIG.SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME');
