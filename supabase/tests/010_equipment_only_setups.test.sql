\set ON_ERROR_STOP on
-- 010 (B5): content_equipment.only_setups — service role writes it, signed-in users read it, old rows default to '{}'.

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

set role service_role;
do $$ declare v int; begin
  insert into public.content_versions (source_file, source_hash) values ('t10.xlsx', 'h10') returning version into v;
  insert into public.content_equipment (version, code, label) values (v, 'eq_any', 'Any setup');
  insert into public.content_equipment (version, code, label, only_setups) values (v, 'eq_gym', 'Gym only', '{gym_a,gym_b}');
  assert (select only_setups from public.content_equipment where version = v and code = 'eq_any') = '{}', 'default empty';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');   -- patient reads the column
do $$ declare s text[]; begin
  select only_setups into s from public.content_equipment where code = 'eq_gym';
  assert s = '{gym_a,gym_b}', format('patient reads only_setups: %s', s);
  begin update public.content_equipment set only_setups = '{}' where code = 'eq_gym';
    raise exception 'FAIL: patient edited only_setups';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role anon;
do $$ begin
  begin perform 1 from public.content_equipment limit 1;
    raise exception 'FAIL: anon read content_equipment';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin
  assert exists (select 1 from public.app_migrations where version = '20261115001000'), 'logged in app_migrations';
end $$;
select 'ALL 010 TESTS PASSED';
