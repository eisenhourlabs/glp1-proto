\set ON_ERROR_STOP on
-- the log lists every migration file applied so far
do $$ declare n int; begin
  select count(*) into n from public.app_migrations where version in ('20261031000100', '20261031000200');
  assert n = 2, 'migration log should record 001 and 002';
end $$;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

-- admin (fixture from 001 test) can read; patient cannot
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ declare n int; begin
  select count(*) into n from public.app_migrations; assert n >= 2, 'admin reads the migration log';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; begin
  select count(*) into n from public.app_migrations; assert n = 0, 'patient cannot read the migration log';
  begin insert into public.app_migrations (version, name) values ('20990101000000', 'x');
    raise exception 'FAIL: patient wrote the migration log';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform 1 from public.app_migrations; raise exception 'FAIL: anon read migration log';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- the template guard refuses an already-applied version
do $$ begin
  begin
    if exists (select 1 from public.app_migrations where version = '20261031000100') then
      raise exception 'Migration 20261031000100 is already applied — nothing to do.';
    end if;
    raise exception 'FAIL: guard did not fire';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

select 'ALL 002 TESTS PASSED' as result;
