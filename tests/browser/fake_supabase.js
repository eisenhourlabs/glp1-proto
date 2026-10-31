// In-browser stand-in for supabase-js used by the browser smoke tests (served in place of the CDN module).
// State lives in sessionStorage so it survives page reloads. Seed it with window.__FAKE_SEED__ (addInitScript).
const KEY = 'fake-db';
const load = () => JSON.parse(sessionStorage.getItem(KEY) || 'null') || structuredClone(window.__FAKE_SEED__ || { tables: {}, session: null });
let S = load();
const save = () => { sessionStorage.setItem(KEY, JSON.stringify(S)); sessionStorage.setItem('fake-next-id', String(nextId)); };
const T = (name) => (S.tables[name] ??= []);
let nextId = Number(sessionStorage.getItem('fake-next-id') || 1000);

class Q {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; this.payload = null; this.one = null; this.sorts = []; this.max = null; }
  select() { return this; }
  eq(c, v) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
  in(c, vs) { this.filters.push((r) => vs.map(String).includes(String(r[c]))); return this; }
  gte(c, v) { this.filters.push((r) => String(r[c]) >= String(v)); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  order(c, { ascending = true } = {}) { this.sorts.push([c, ascending]); return this; }
  limit(n) { this.max = n; return this; }
  delete() { this.op = 'delete'; return this; }
  upsert(rows, { onConflict } = {}) { this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; this.keys = (onConflict || 'id').split(','); return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  update(f) { this.op = 'update'; this.payload = f; return this; }
  match(r) { return this.filters.every((f) => f(r)); }
  run() {
    const t = T(this.table);
    let data;
    if (this.op === 'insert') {
      data = this.payload.map((r) => ({ id: r.id ?? nextId++, created_at: new Date().toISOString(), ...r }));
      t.push(...data);
    } else if (this.op === 'upsert') {
      data = this.payload.map((row) => {
        const hit = t.find((r) => this.keys.every((k) => String(r[k]) === String(row[k])));
        if (hit) return Object.assign(hit, row);
        const fresh = { id: nextId++, created_at: new Date().toISOString(), ...row }; t.push(fresh); return fresh;
      });
    } else if (this.op === 'update') {
      data = t.filter((r) => this.match(r)); data.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === 'delete') {
      data = t.filter((r) => this.match(r)); S.tables[this.table] = t.filter((r) => !this.match(r));
    } else {
      data = t.filter((r) => this.match(r));
      if (this.table === 'profiles') data = data.map((p) => ({ ...p, clinics: T('clinics').find((c) => c.id === p.clinic_id) ?? null }));
      if (this.table === 'clinics') data = data.map((c) => ({ ...c, clinic_codes: T('clinic_codes').filter((k) => k.clinic_id === c.id) }));
    }
    for (const [c, asc] of [...this.sorts].reverse()) {
      data = [...data].sort((a, b) => (a[c] === b[c] ? 0 : (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)));
    }
    if (this.max != null) data = data.slice(0, this.max);
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
  clinic_report: () => S.rpc?.clinic_report ?? null,
  clinic_checkin_list: () => S.rpc?.clinic_checkin_list ?? [],
  admin_set_patient_status: ({ p_patient, p_status, p_note }) => { const p = T('patients').find((x) => x.id === p_patient); if (p.status === 'onboarding') throw new Error('onboarding'); if (p_status === 'active' && p.screening_flag === 'pause') p.screening_flag = 'cleared'; p.status = p_status; T('adjustments').push({ id: nextId++, patient_id: p_patient, type: 'status', reason: p_note || 'admin change', detail: { to: p_status }, created_at: new Date().toISOString() }); return p_status; },
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
