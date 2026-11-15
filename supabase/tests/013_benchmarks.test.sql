\set ON_ERROR_STOP on
-- 013 (B13): a patient records and reads only her own results; nobody edits or deletes them; clinic staff and other
-- patients see nothing; admins read; the service role can do everything; bad values are refused.

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

update public.patients set status = 'active' where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');

-- pat-a records results
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare ref uuid := gen_random_uuid(); begin
  insert into public.benchmarks (patient_id, moment, test, value, variant, client_ref) values (auth.uid(), 'baseline', 'lower_body', 9, null, ref);
  insert into public.benchmarks (patient_id, moment, test, value, variant) values (auth.uid(), 'baseline', 'upper_body', 6, 'wall');
  insert into public.benchmarks (patient_id, moment, test, value) values (auth.uid(), 'baseline', 'carry_hold', 25);
  -- a resent save lands once
  insert into public.benchmarks (patient_id, moment, test, value, variant, client_ref) values (auth.uid(), 'baseline', 'lower_body', 9, null, ref)
    on conflict (client_ref) do nothing;
  assert (select count(*) from public.benchmarks where test = 'lower_body') = 1, 'a resend is stored once';
  assert (select count(*) from public.benchmarks) = 3, 'she reads her own three';
  -- someone else's row, and bad values, are refused
  begin insert into public.benchmarks (patient_id, moment, test, value) values ('00000000-0000-0000-0000-0000000000b1', 'baseline', 'lower_body', 5);
    raise exception 'FAIL: wrote a row for another patient'; exception when insufficient_privilege then null; end;
  begin insert into public.benchmarks (patient_id, moment, test, value) values (auth.uid(), 'baseline', 'lower_body', -1);
    raise exception 'FAIL: negative value accepted'; exception when check_violation then null; end;
  begin insert into public.benchmarks (patient_id, moment, test, value) values (auth.uid(), 'baseline', 'lower_body', 601);
    raise exception 'FAIL: huge value accepted'; exception when check_violation then null; end;
  begin insert into public.benchmarks (patient_id, moment, test, value) values (auth.uid(), 'baseline', 'chair_stand', 5);
    raise exception 'FAIL: unknown test accepted'; exception when check_violation then null; end;
  begin insert into public.benchmarks (patient_id, moment, test, value) values (auth.uid(), 'weekly', 'lower_body', 5);
    raise exception 'FAIL: unknown moment accepted'; exception when check_violation then null; end;
  -- results are never edited or deleted
  begin update public.benchmarks set value = 99; raise exception 'FAIL: edited a result'; exception when insufficient_privilege then null; end;
  begin delete from public.benchmarks; raise exception 'FAIL: deleted a result'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- another patient sees none of it, and records her own
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  assert (select count(*) from public.benchmarks) = 0, 'another patient sees nothing';
  insert into public.benchmarks (patient_id, moment, test, value) values (auth.uid(), 'transition', 'carry_hold', 40);
  assert (select count(*) from public.benchmarks) = 1, 'she sees her own one';
end $$;
reset role;

-- clinic staff cannot read the table (their clinic is pat-a's clinic)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare n int; begin
  select count(*) into n from public.benchmarks;
  assert n = 0, 'clinic viewer sees no results';
  begin insert into public.benchmarks (patient_id, moment, test, value) values ('00000000-0000-0000-0000-0000000000a1', 'baseline', 'lower_body', 1);
    raise exception 'FAIL: clinic viewer wrote a result'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- anonymous callers have no access
set role anon;
do $$ begin
  begin perform count(*) from public.benchmarks; raise exception 'FAIL: anon read results'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- admins read everything
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin assert (select count(*) from public.benchmarks) = 4, 'admin reads all four'; end $$;
reset role;

-- a patient who can't train (inactive) cannot add results, but still reads hers
update public.patients set status = 'inactive' where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  begin insert into public.benchmarks (patient_id, moment, test, value) values (auth.uid(), 'transition', 'lower_body', 8);
    raise exception 'FAIL: an inactive patient added a result'; exception when insufficient_privilege then null; end;
  assert (select count(*) from public.benchmarks) = 1, 'an inactive patient still reads her own';
end $$;
reset role;
update public.patients set status = 'active' where id = '00000000-0000-0000-0000-0000000000b1';

-- the service role (operator scripts, future reports) can read and write
set role service_role;
do $$ begin
  assert (select count(*) from public.benchmarks) = 4, 'service role reads';
  delete from public.benchmarks where test = 'carry_hold' and patient_id = '00000000-0000-0000-0000-0000000000b1';
end $$;
reset role;

select 'ALL 013 TESTS PASSED';
