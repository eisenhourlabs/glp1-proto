-- RLS tests for migration 001. Run by scripts/test_db.sh after the stub + migrations.
-- Each block impersonates a role (SET ROLE + JWT claims) and asserts what it can see/do.
\set ON_ERROR_STOP on

-- ── fixtures (as superuser) ─────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test'),
  ('00000000-0000-0000-0000-0000000000a1', 'pat-a@test'),
  ('00000000-0000-0000-0000-0000000000a2', 'pat-a2@test'),
  ('00000000-0000-0000-0000-0000000000b1', 'pat-b@test'),
  ('00000000-0000-0000-0000-0000000000c1', 'clinic-a@test'),
  ('00000000-0000-0000-0000-0000000000ff', 'no-profile@test');

insert into public.clinics (id, name, accent_color, is_demo) values
  ('10000000-0000-0000-0000-00000000000a', 'Clinic A', '#336699', true),
  ('10000000-0000-0000-0000-00000000000b', 'Clinic B', null, true),
  ('10000000-0000-0000-0000-00000000000c', 'Clinic Closed', null, true);
update public.clinics set status = 'closed' where id = '10000000-0000-0000-0000-00000000000c';

insert into public.clinic_codes (code, clinic_id, active, expires_at) values
  ('CLINICA', '10000000-0000-0000-0000-00000000000a', true, null),
  ('OLD-A',   '10000000-0000-0000-0000-00000000000a', false, null),
  ('EXPIRED', '10000000-0000-0000-0000-00000000000b', true, now() - interval '1 day'),
  ('CLOSED',  '10000000-0000-0000-0000-00000000000c', true, null);

insert into public.profiles (id, role, clinic_id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'admin', null, 'Admin'),
  ('00000000-0000-0000-0000-0000000000a1', 'patient', '10000000-0000-0000-0000-00000000000a', 'Pat A'),
  ('00000000-0000-0000-0000-0000000000a2', 'patient', '10000000-0000-0000-0000-00000000000a', 'Pat A2'),
  ('00000000-0000-0000-0000-0000000000b1', 'patient', '10000000-0000-0000-0000-00000000000b', 'Pat B'),
  ('00000000-0000-0000-0000-0000000000c1', 'clinic_viewer', '10000000-0000-0000-0000-00000000000a', 'Front desk A');

insert into public.app_settings (key, value) values ('adjust.max_load_step_pct', '10');

-- constraint: non-admin must have a clinic
do $$ begin
  begin
    insert into public.profiles (id, role) values ('00000000-0000-0000-0000-0000000000ff', 'patient');
    raise exception 'FAIL: patient without clinic was accepted';
  exception when check_violation then null; end;
end $$;

-- helper to impersonate
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

-- ── anon ────────────────────────────────────────────────────────────────────
set role anon;
do $$ declare n int; begin
  begin perform 1 from public.clinics; raise exception 'FAIL: anon read clinics';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.profiles; raise exception 'FAIL: anon read profiles';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.clinic_branding_for_code(' clinica ');
  assert n = 1, 'anon: valid code should return branding';
  select count(*) into n from public.clinic_branding_for_code('OLD-A');
  assert n = 0, 'anon: inactive code must return nothing';
  select count(*) into n from public.clinic_branding_for_code('EXPIRED');
  assert n = 0, 'anon: expired code must return nothing';
  select count(*) into n from public.clinic_branding_for_code('CLOSED');
  assert n = 0, 'anon: closed clinic must return nothing';
end $$;
reset role;

-- ── patient A ──────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; r text; begin
  select count(*) into n from public.profiles;            assert n = 1, 'patient sees only her own profile';
  select count(*) into n from public.clinics;             assert n = 1, 'patient sees only her clinic';
  select name into r from public.clinics;                 assert r = 'Clinic A', 'patient sees her own clinic';
  select count(*) into n from public.clinic_codes;        assert n = 0, 'patient sees no codes';
  select public.my_role()::text into r;                   assert r = 'patient', 'my_role = patient';
  assert not public.is_admin(), 'patient is not admin';

  update public.profiles set display_name = 'Pat A renamed' where id = auth.uid();
  select display_name into r from public.profiles where id = auth.uid();
  assert r = 'Pat A renamed', 'patient can change her display name';

  begin update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FAIL: patient changed her role';
  exception when insufficient_privilege then null; end;

  begin update public.profiles set clinic_id = '10000000-0000-0000-0000-00000000000b' where id = auth.uid();
    raise exception 'FAIL: patient changed her clinic';
  exception when insufficient_privilege then null; end;

  update public.profiles set display_name = 'hack' where id = '00000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;                          assert n = 0, 'patient cannot rename another patient';

  update public.clinics set name = 'hacked';
  get diagnostics n = row_count;                          assert n = 0, 'patient cannot edit clinics';

  begin insert into public.clinic_codes (code, clinic_id) values ('NEWCODE', '10000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: patient created a clinic code';
  exception when insufficient_privilege then null; end;

  select count(*) into n from public.app_settings;        assert n = 1, 'patient can read settings';
  update public.app_settings set value = '99';
  get diagnostics n = row_count;                          assert n = 0, 'patient cannot write settings';
end $$;
reset role;

-- ── clinic viewer A ────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare n int; begin
  select count(*) into n from public.profiles;            assert n = 1, 'clinic viewer sees only her own profile (no patient rows)';
  select count(*) into n from public.clinics;             assert n = 1, 'clinic viewer sees only her clinic';
  select count(*) into n from public.clinic_codes;        assert n = 0, 'clinic viewer sees no codes';
end $$;
reset role;

-- ── user with a login but no profile ───────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ff');
do $$ declare n int; begin
  select count(*) into n from public.profiles;            assert n = 0, 'no-profile user sees no profiles';
  select count(*) into n from public.clinics;             assert n = 0, 'no-profile user sees no clinics';
  assert public.my_role() is null, 'no-profile user has no role';
end $$;
reset role;

-- ── admin ──────────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ declare n int; begin
  select count(*) into n from public.profiles;            assert n = 5, 'admin sees all profiles';
  select count(*) into n from public.clinics;             assert n = 3, 'admin sees all clinics';
  select count(*) into n from public.clinic_codes;        assert n = 4, 'admin sees all codes';
  insert into public.clinics (name) values ('Clinic New');
  insert into public.clinic_codes (code, clinic_id) select 'NEW-1', id from public.clinics where name = 'Clinic New';
  update public.app_settings set value = '8' where key = 'adjust.max_load_step_pct';
  get diagnostics n = row_count;                          assert n = 1, 'admin can write settings';
end $$;
reset role;

-- ── service_role (operator scripts) ────────────────────────────────────────
set role service_role;
do $$ declare n int; begin
  select count(*) into n from public.profiles;            assert n = 5, 'service_role sees all profiles';
  insert into public.clinics (name) values ('Clinic via script');
  update public.profiles set role = 'clinic_viewer' where id = '00000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;                          assert n = 1, 'service_role can change roles';
end $$;
reset role;

select 'ALL 001 RLS TESTS PASSED' as result;
