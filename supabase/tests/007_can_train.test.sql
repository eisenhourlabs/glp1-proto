\set ON_ERROR_STOP on
-- 007 (A12): an inactive patient, or one whose clinic is closed, keeps read access but can't write.
-- State from 004/005: a1 active in clinic A; a2 active in clinic A; b1 active in clinic B, one workout each.

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

update public.patients set status = 'inactive' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set clinic_id = '10000000-0000-0000-0000-00000000000c' where id = '00000000-0000-0000-0000-0000000000a2';  -- closed clinic

-- inactive: reads work, writes refused
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare n int; begin
  assert not public.can_train(), 'inactive cannot train';
  select count(*) into n from public.session_logs; assert n >= 1, 'inactive can still read her logs';
  begin insert into public.session_logs (patient_id, log_date, status) values (auth.uid(), '2026-11-20', 'done');
    raise exception 'FAIL: inactive patient logged a workout';
  exception when insufficient_privilege then null; end;
  begin insert into public.flags (patient_id, type) values (auth.uid(), 'problem');
    raise exception 'FAIL: inactive patient raised a flag';
  exception when insufficient_privilege then null; end;
  begin insert into public.adjustments (patient_id, type, reason) values (auth.uid(), 'x', 'y');
    raise exception 'FAIL: inactive patient wrote an adjustment';
  exception when insufficient_privilege then null; end;
  update public.session_logs set note = 'changed' where patient_id = auth.uid();
  get diagnostics n = row_count; assert n = 0, 'inactive cannot update her logs';
end $$;
reset role;

-- closed clinic: same
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  assert not public.can_train(), 'closed clinic cannot train';
  begin insert into public.session_logs (patient_id, log_date, status) values (auth.uid(), '2026-11-20', 'done');
    raise exception 'FAIL: patient of a closed clinic logged a workout';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- active patient of an active clinic: still writes
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare sid bigint; begin
  assert public.can_train(), 'active can train';
  insert into public.session_logs (patient_id, log_date, status) values (auth.uid(), '2026-11-20', 'in_progress') returning id into sid;
  update public.session_logs set status = 'done' where id = sid;
  insert into public.exercise_logs (session_log_id, patient_id, slot, exercise_id, sets) values (sid, auth.uid(), 'P1', 'SQ04', '[]');
  insert into public.adjustments (patient_id, type, reason) values (auth.uid(), 'self_lighter_week', 'patient_choice');
end $$;
reset role;

-- put the fixtures back for later tests
update public.patients set status = 'active' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set clinic_id = '10000000-0000-0000-0000-00000000000a' where id = '00000000-0000-0000-0000-0000000000a2';
select 'ALL 007 TESTS PASSED';
