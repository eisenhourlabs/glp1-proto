\set ON_ERROR_STOP on
-- Content tables: service role writes + activates; signed-in users read; anon nothing; nobody else writes.

set role service_role;
do $$ declare v1 int; v2 int; begin
  insert into public.content_versions (source_file, source_hash) values ('t.xlsx', 'h1') returning version into v1;
  insert into public.content_exercises (version, id, name, pattern, level, equipment, load_type, measure, area_load, floor, unilateral)
    values (v1, 'SQ01', 'Sit-to-Stand', 'SQ', 1, 'chair', 'bodyweight', 'reps', '{"knees":1}', false, false);
  insert into public.content_templates (version, template_id, cycle_type, days_per_week, name, sessions)
    values (v1, 'C1-3D', 'C1', 3, 'Foundations', '[{"session":"A"}]');
  insert into public.content_slots (version, template_id, session, slot, ord, role, pattern, min_minutes, sets_by_week, reps_by_week, rir_by_week, rest_sec)
    values (v1, 'C1-3D', 'A', 'P1', 1, 'P', 'SQ', 30, '{2,2,3,3,3,3,3,3}', '{10-12,10-12,10-12,10-12,10-12,10-12,10-12,10-12}', '{3,3,3,3,3,3,3,3}', 90);
  perform public.content_activate(v1);
  assert public.content_current_version() = v1, 'v1 current';

  insert into public.content_versions (source_file, source_hash) values ('t.xlsx', 'h2') returning version into v2;
  perform public.content_activate(v2);
  assert public.content_current_version() = v2, 'v2 current';
  assert (select count(*) from public.content_versions where is_current) = 1, 'exactly one current version';
  begin
    perform public.content_activate(9999); raise exception 'FAIL: activated a missing version';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- slot rows must have 8 weeks
  begin
    insert into public.content_slots (version, template_id, session, slot, ord, role, pattern, min_minutes, sets_by_week, reps_by_week, rir_by_week, rest_sec)
      values (v1, 'C1-3D', 'A', 'P2', 2, 'P', 'HR', 30, '{3,3}', '{8-12,8-12}', '{2,2}', 90);
    raise exception 'FAIL: accepted a slot without 8 weeks';
  exception when check_violation then null; end;
end $$;
reset role;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');   -- patient (fixture from 001)
do $$ declare n int; begin
  select count(*) into n from public.content_exercises; assert n = 1, 'patient reads exercises';
  select count(*) into n from public.content_slots;     assert n = 1, 'patient reads slots';
  assert public.content_current_version() is not null, 'patient sees the current version number';
  begin insert into public.content_versions (source_file, source_hash) values ('x', 'x');
    raise exception 'FAIL: patient created a content version';
  exception when insufficient_privilege then null; end;
  begin update public.content_exercises set name = 'hacked';
    raise exception 'FAIL: patient edited content';
  exception when insufficient_privilege then null; end;
  begin perform public.content_activate(1);
    raise exception 'FAIL: patient activated content';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');   -- admin: reads, but writes only via the importer
do $$ begin
  begin update public.content_exercises set name = 'x';
    raise exception 'FAIL: admin edited content directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role anon;
do $$ begin
  begin perform 1 from public.content_exercises; raise exception 'FAIL: anon read content';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- the migration log recorded 003
do $$ begin
  assert exists (select 1 from public.app_migrations where version = '20261031000300'), 'log records 003';
end $$;
select 'ALL 003 TESTS PASSED' as result;
