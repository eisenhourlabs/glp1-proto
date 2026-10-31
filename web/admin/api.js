// Admin data access. Admins read everything through RLS (is_admin() policies); writes are limited to clinics, codes,
// settings and resolving flags.
import { db } from '../shared/supa.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let contentCache = null;
/** Templates and library of the current content version (names for display). */
export async function loadContent() {
  if (contentCache) return contentCache;
  const version = must(await db.rpc('content_current_version'));
  const [templates, library] = await Promise.all([
    db.from('content_templates').select('template_id,name,days_per_week,sessions,cycle_type').eq('version', version).then(must),
    db.from('content_exercises').select('id,name,pattern,level,load_type,measure').eq('version', version).then(must),
  ]);
  contentCache = { version, templates, library };
  return contentCache;
}

export const clinics = async () => must(await db.from('clinics').select('*, clinic_codes ( code, active, note, expires_at, created_at )').order('name'));

/** Everything the patient list needs, in a few queries. */
export async function patientOverview() {
  const [profiles, patients, cycles, logs, flags] = await Promise.all([
    db.from('profiles').select('id, display_name, clinic_id, is_demo, created_at').eq('role', 'patient').then(must),
    db.from('patients').select('id, status, screening_flag, start_date, days_per_week, age_band, experience, goal').then(must),
    db.from('cycles').select('id, patient_id, cycle_no, template_id, start_date, status, week_modes').eq('status', 'active').then(must),
    db.from('session_logs').select('id, patient_id, cycle_id, week, session, log_date, status, skip_reason, feel, energy').order('log_date').then(must),
    db.from('flags').select('id, patient_id, type, created_at').is('resolved_at', null).then(must),
  ]);
  return { profiles, patients, cycles, logs, flags };
}

export async function patientDetail(id) {
  const one = (q) => q.then(must);
  const [profile, patient, cycles, logs, flags, adjustments, docs, exLogs] = await Promise.all([
    one(db.from('profiles').select('id, display_name, clinic_id, is_demo, created_at, clinics ( name )').eq('id', id).single()),
    one(db.from('patients').select('*').eq('id', id).single()),
    one(db.from('cycles').select('*').eq('patient_id', id).order('cycle_no')),
    one(db.from('session_logs').select('*').eq('patient_id', id).order('log_date', { ascending: false }).order('id', { ascending: false })),
    one(db.from('flags').select('*').eq('patient_id', id).order('created_at', { ascending: false })),
    one(db.from('adjustments').select('*').eq('patient_id', id).order('created_at', { ascending: false })),
    one(db.from('patient_documents').select('doc_type, doc_version, signed_at').eq('patient_id', id).order('signed_at')),
    one(db.from('exercise_logs').select('exercise_id, sets, skipped, created_at').eq('patient_id', id).eq('skipped', false).order('created_at')),
  ]);
  return { profile, patient, cycles, logs, flags, adjustments, docs, exLogs };
}

export async function openFlags() {
  const flags = must(await db.from('flags').select('*').is('resolved_at', null).order('created_at', { ascending: false }));
  const ids = [...new Set(flags.map((f) => f.patient_id))];
  const people = ids.length ? must(await db.from('profiles').select('id, display_name, clinics ( name )').in('id', ids)) : [];
  return { flags, people: Object.fromEntries(people.map((p) => [p.id, p])) };
}

export async function resolveFlag(id, adminId) {
  return must(await db.from('flags').update({ resolved_at: new Date().toISOString(), resolved_by: adminId }).eq('id', id));
}

export const createClinic = async (row) => must(await db.from('clinics').insert(row).select().single());
export const updateClinic = async (id, fields) => must(await db.from('clinics').update(fields).eq('id', id));
export const addCode = async (row) => must(await db.from('clinic_codes').insert(row));
export const setCodeActive = async (code, active) => must(await db.from('clinic_codes').update({ active }).eq('code', code));

export const setPatientStatus = async (id, status, note) =>
  must(await db.rpc('admin_set_patient_status', { p_patient: id, p_status: status, p_note: note || null }));

export const settings = async () => must(await db.from('app_settings').select('*').order('key'));
export const saveSetting = async (key, value) => must(await db.from('app_settings').update({ value }).eq('key', key));
export const contentVersions = async () => must(await db.from('content_versions').select('version, imported_at, source_file, note, is_current, summary').order('version', { ascending: false }));
