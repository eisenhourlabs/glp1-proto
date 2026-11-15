\set ON_ERROR_STOP on
-- 008 (A16): clinic and patient time zones; reports count "today" in the clinic's zone.

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

do $$ declare s text; begin
  select timezone into s from public.clinics where id = '10000000-0000-0000-0000-00000000000a';
  assert s = 'America/Chicago', 'existing clinics default to America/Chicago';
  begin update public.clinics set timezone = 'Mars/Olympus' where id = '10000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL: unknown time zone accepted';
  exception when check_violation then null; end;
  -- a zone 14 hours ahead of UTC makes the clinic's "today" visibly different from UTC most of the day
  update public.clinics set timezone = 'Pacific/Kiritimati' where id = '10000000-0000-0000-0000-00000000000a';
  assert public.clinic_today('10000000-0000-0000-0000-00000000000a') = (now() at time zone 'Pacific/Kiritimati')::date, 'clinic_today uses its zone';
end $$;

-- a clinic viewer's report without a date is "as of" today in the clinic's zone
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare r jsonb; n int; begin
  r := public.clinic_report();
  assert (r ->> 'as_of')::date = (now() at time zone 'Pacific/Kiritimati')::date, format('as_of in the clinic zone: %s', r ->> 'as_of');
  select count(*) into n from public.clinic_checkin_list(); assert n >= 1, 'check-in list without a date';
  -- a Sunday workout (logged with her local date) counts in that Sunday's week
  r := public.clinic_report(null, '2026-11-08');
  assert (select (w ->> 'completed')::int from jsonb_array_elements(r -> 'weekly') w where w ->> 'week_start' = '2026-11-02') >= 1,
    'the week of Mon 2026-11-02 includes its workouts';
  begin perform public.clinic_today('10000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: clinic_today is not for app users';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- patients set their own time zone (from the browser), and only a real one
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare s text; begin
  update public.patients set timezone = 'America/New_York' where id = auth.uid();
  select timezone into s from public.patients where id = auth.uid(); assert s = 'America/New_York';
  begin update public.patients set timezone = 'Nowhere/Land' where id = auth.uid();
    raise exception 'FAIL: unknown patient time zone accepted';
  exception when check_violation then null; end;
end $$;
reset role;
update public.clinics set timezone = 'America/Chicago' where id = '10000000-0000-0000-0000-00000000000a';
select 'ALL 008 TESTS PASSED';
