// In-browser stand-in for supabase-js used by the browser smoke tests (served in place of the CDN module).
// State lives in sessionStorage so it survives page reloads. Seed it with window.__FAKE_SEED__ (addInitScript).
const KEY = 'fake-db';
const load = () => JSON.parse(sessionStorage.getItem(KEY) || 'null') || structuredClone(window.__FAKE_SEED__ || { tables: {}, session: null });
let S = load();
const save = () => sessionStorage.setItem(KEY, JSON.stringify(S));
const T = (name) => (S.tables[name] ??= []);
let nextId = 1000;

class Q {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; this.payload = null; this.one = null; this.ret = false; }
  select() { if (this.op !== 'select') this.ret = true; return this; }
  eq(c, v) { this.filters.push([c, v]); return this; }
  order() { return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(f) { this.op = 'update'; this.payload = f; return this; }
  match(r) { return this.filters.every(([c, v]) => String(r[c]) === String(v)); }
  run() {
    const t = T(this.table);
    let data;
    if (this.op === 'insert') {
      data = this.payload.map((r) => ({ id: r.id ?? nextId++, created_at: new Date().toISOString(), ...r }));
      t.push(...data);
    } else if (this.op === 'update') {
      data = t.filter((r) => this.match(r)); data.forEach((r) => Object.assign(r, this.payload));
    } else {
      data = t.filter((r) => this.match(r));
      if (this.table === 'profiles') data = data.map((p) => ({ ...p, clinics: T('clinics').find((c) => c.id === p.clinic_id) ?? null }));
    }
    save();
    if (this.one) data = data[0] ?? null;
    if (this.one === 'single' && !data) return { data: null, error: { message: 'no rows' } };
    return { data: structuredClone(data), error: null };
  }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
}

const me = () => S.session?.user?.id;
const patient = () => T('patients').find((p) => p.id === me());
const RPC = {
  content_current_version: () => 1,
  patient_set_screening: ({ p_red_flag }) => { const p = patient(); if (p.status === 'onboarding') p.screening_flag = p_red_flag ? 'pause' : 'none'; },
  patient_complete_onboarding: ({ p_start }) => { const p = patient(); p.status = p.screening_flag === 'pause' ? 'paused' : 'active'; p.start_date ??= p_start; return p.status; },
  patient_self_clear: ({ p_signed_name }) => { const p = patient(); T('patient_documents').push({ patient_id: p.id, doc_type: 'clearance', signed_name: p_signed_name }); p.screening_flag = 'cleared'; p.status = 'active'; return p.status; },
};

export function createClient() {
  const listeners = [];
  return {
    from: (t) => new Q(t),
    rpc: async (name, args) => { const data = RPC[name](args || {}); save(); return { data, error: null }; },
    auth: {
      getSession: async () => ({ data: { session: S.session } }),
      signInWithPassword: async ({ email, password }) => {
        const u = (S.users || []).find((x) => x.email === email && x.password === password);
        if (!u) return { error: new Error('bad') };
        S.session = { user: { id: u.id, email } }; save(); return { error: null };
      },
      signOut: async () => { S.session = null; save(); listeners.forEach((f) => f('SIGNED_OUT')); },
      resetPasswordForEmail: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
      onAuthStateChange: (f) => { listeners.push(f); return { data: { subscription: { unsubscribe() {} } } }; },
    },
  };
}
