\set ON_ERROR_STOP on
-- 009 (D8): clinic reports hide counts of 1 to 4 patients and every percentage for a clinic under 5 patients.

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

update public.app_settings set value = '5' where key = 'report.min_cell';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare r jsonb; begin
  r := public.clinic_report(null, '2026-11-12');                      -- clinic A: 2 patients
  assert (r ->> 'min_cell')::int = 5;
  assert (r ->> 'small_clinic')::boolean, 'under 5 patients';
  assert r -> 'enrolled' = 'null'::jsonb and r -> 'active_now' = 'null'::jsonb, format('counts hidden: %s', r);
  assert r -> 'suppressed' ? 'enrolled', 'listed as suppressed';
  assert jsonb_array_length(r -> 'weekly') = 0, 'no weekly rates';
  assert r -> 'strength' -> 'avg_load_change_pct' = 'null'::jsonb, 'no average change';
end $$;
reset role;

update public.app_settings set value = '{"value": 2}' where key = 'report.min_cell';  -- the object form works too
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare r jsonb; begin
  r := public.clinic_report(null, '2026-11-12');
  assert (r ->> 'enrolled')::int = 2, format('2 shown when the minimum is 2: %s', r);
  assert not (r ->> 'small_clinic')::boolean;
  assert jsonb_array_length(r -> 'weekly') = 8, 'weekly rates back';
end $$;
reset role;

update public.app_settings set value = '0' where key = 'report.min_cell';
do $$ begin
  assert public.small_cell(3, 5) is null and public.small_cell(0, 5) = 0 and public.small_cell(5, 5) = 5, 'small_cell';
end $$;
select 'ALL 009 TESTS PASSED';
