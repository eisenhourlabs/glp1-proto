\set ON_ERROR_STOP on
-- 011 (C4): a write sent twice with the same client_ref is stored once; client_ref stays the patient's own.

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; ref uuid := 'c4c4c4c4-0000-4000-8000-000000000001'; begin
  assert public.can_train(), 'a1 can train (fixture)';
  -- the app's replay: insert … on conflict (client_ref) do nothing, twice
  for i in 1..2 loop
    insert into public.session_logs (patient_id, log_date, status, client_ref) values (auth.uid(), '2026-11-21', 'in_progress', ref)
      on conflict (client_ref) do nothing;
    insert into public.flags (patient_id, type, detail, client_ref) values (auth.uid(), 'dizzy', '{}', ref)
      on conflict (client_ref) do nothing;
    insert into public.adjustments (patient_id, type, reason, client_ref) values (auth.uid(), 'short_version', 'patient_choice', ref)
      on conflict (client_ref) do nothing;
  end loop;
  select count(*) into n from public.session_logs where client_ref = ref; assert n = 1, 'one workout';
  select count(*) into n from public.flags where client_ref = ref; assert n = 1, 'one flag';
  select count(*) into n from public.adjustments where client_ref = ref; assert n = 1, 'one adjustment';
  -- rows without a client_ref (older app versions) are unaffected
  insert into public.session_logs (patient_id, log_date, status) values (auth.uid(), '2026-11-22', 'skipped');
  insert into public.session_logs (patient_id, log_date, status) values (auth.uid(), '2026-11-22', 'skipped');
end $$;
reset role;

-- another patient cannot claim or overwrite a1's ref (the conflict is silent; her row is not touched)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ declare n int; begin
  begin
    insert into public.session_logs (patient_id, log_date, status, client_ref)
      values ('00000000-0000-0000-0000-0000000000a1', '2026-11-21', 'done', 'c4c4c4c4-0000-4000-8000-000000000001');
    raise exception 'FAIL: wrote a row for another patient';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select status from public.session_logs where client_ref = 'c4c4c4c4-0000-4000-8000-000000000001') = 'in_progress', 'untouched';
  assert exists (select 1 from public.app_migrations where version = '20261115001100'), 'logged';
end $$;
select 'ALL 011 TESTS PASSED';
