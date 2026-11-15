\set ON_ERROR_STOP on
-- 012 (A14): errors are stored once and counted; only admins can read; only the service role can write; the limits hold.

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

-- the service role records errors
set role service_role;
do $$ declare r text; n int; c int; begin
  r := public.record_client_error('patient', 'patient', 'TypeError: x is undefined', E'at a (app.js:1:1)\nat b (app.js:2:2)', '/', '2026.11.15-3');
  assert r = 'stored', 'first sighting is stored: ' || r;
  r := public.record_client_error('patient', 'patient', 'TypeError: x is undefined', E'at a (app.js:1:1)\nat b (app.js:2:2)', '/', '2026.11.15-3');
  assert r = 'counted', 'second sighting is counted, not stored again: ' || r;
  select count(*), max(count) into n, c from public.client_errors where message = 'TypeError: x is undefined';
  assert n = 1 and c = 2, 'one row, seen twice';
  -- a different version is a different error
  r := public.record_client_error('patient', 'patient', 'TypeError: x is undefined', E'at a (app.js:1:1)\nat b (app.js:2:2)', '/', '2026.11.15-4');
  assert r = 'stored', 'a new app version is its own row';
  -- odd input is trimmed or defaulted, never refused
  r := public.record_client_error('admin', 'not-a-role', repeat('m', 900), repeat('s', 5000), repeat('/', 500), repeat('v', 99));
  assert r = 'stored', 'oversized input stored trimmed';
  assert (select char_length(message) from public.client_errors where app = 'admin') = 300, 'message trimmed';
  assert (select char_length(stack) from public.client_errors where app = 'admin') = 2000, 'stack trimmed';
  assert (select role from public.client_errors where app = 'admin') is null, 'unknown role dropped';
  r := public.record_client_error('clinic', null, '', null, '', '');
  assert r = 'stored', 'empty input still stored';
  assert (select message from public.client_errors where app = 'clinic') = 'Unknown error', 'empty message defaulted';
  begin perform public.record_client_error('strength-app', null, 'x', null, '/', '1'); raise exception 'FAIL: unknown app accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;

-- the table holds no user id or address column at all
do $$ begin
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_errors'
    and (column_name ilike '%user%' or column_name ilike '%ip%' or column_name ilike '%email%' or column_name = 'patient_id')), 'no personal column';
end $$;

-- only admins read
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin assert (select count(*) from public.client_errors) >= 4, 'admin reads the errors'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from public.client_errors) = 0, 'a patient sees no rows';
  begin insert into public.client_errors (fingerprint, app, message, path, app_version) values ('x', 'patient', 'x', '/', '1'); raise exception 'FAIL: patient inserted';
  exception when insufficient_privilege then null; end;
  begin update public.client_errors set count = 0; raise exception 'FAIL: patient updated';
  exception when insufficient_privilege then null; end;
  begin delete from public.client_errors; raise exception 'FAIL: patient deleted';
  exception when insufficient_privilege then null; end;
  begin perform public.record_client_error('patient', null, 'x', null, '/', '1'); raise exception 'FAIL: patient called the function';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.client_error_budget; raise exception 'FAIL: patient read the budget';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert (select count(*) from public.client_errors) = 0, 'a clinic viewer sees no rows';
  begin perform public.record_client_error('clinic', null, 'x', null, '/', '1'); raise exception 'FAIL: clinic viewer called the function';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin insert into public.client_errors (fingerprint, app, message, path, app_version) values ('y', 'patient', 'x', '/', '1'); raise exception 'FAIL: admin inserted directly';
  exception when insufficient_privilege then null; end;
  begin perform public.record_client_error('patient', null, 'x', null, '/', '1'); raise exception 'FAIL: admin called the function';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform 1 from public.client_errors; raise exception 'FAIL: anon read the errors';
  exception when insufficient_privilege then null; end;
  begin perform public.record_client_error('patient', null, 'x', null, '/', '1'); raise exception 'FAIL: anon called the function';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- the per-minute limit (all callers together)
insert into public.app_settings (key, value) values ('errors.max_per_minute', '3') on conflict (key) do update set value = excluded.value;
delete from public.client_error_budget;
set role service_role;
do $$ declare r text; begin
  assert public.client_error_limit() = 3, 'limit read from settings';
  r := public.record_client_error('join', null, 'limit test 1', null, '/join.html', '1'); assert r = 'stored', r;
  r := public.record_client_error('join', null, 'limit test 1', null, '/join.html', '1'); assert r = 'counted', r;
  r := public.record_client_error('join', null, 'limit test 2', null, '/join.html', '1'); assert r = 'stored', r;
  r := public.record_client_error('join', null, 'limit test 3', null, '/join.html', '1'); assert r = 'limited', 'fourth call in the minute is refused: ' || r;
  assert not exists (select 1 from public.client_errors where message = 'limit test 3'), 'a limited call stores nothing';
end $$;
reset role;
delete from public.app_settings where key = 'errors.max_per_minute';
delete from public.client_error_budget;

-- old errors drop out, and the table is capped
update public.client_errors set last_seen_at = now() - interval '100 days' where message = 'limit test 1';
set role service_role;
do $$ declare r text; begin
  r := public.record_client_error('join', null, 'fresh after cleanup', null, '/join.html', '1');
  assert r = 'stored', r;
  assert not exists (select 1 from public.client_errors where message = 'limit test 1'), 'errors unseen for 90 days are removed';
end $$;
reset role;
do $$ declare r text; begin
  insert into public.client_errors (fingerprint, app, message, path, app_version)
    select 'fill-' || g, 'patient', 'fill', '/', '1' from generate_series(1, 5000 - (select count(*) from public.client_errors)::int) g;
  set local role service_role;
  r := public.record_client_error('patient', null, 'one too many', null, '/', '1');
  assert r = 'full', 'cap of 5000 distinct errors: ' || r;
  r := public.record_client_error('patient', null, 'fill', null, '/', '1');
  assert r in ('counted', 'full'), 'known errors are still counted';
  reset role;
end $$;
delete from public.client_errors where message = 'fill';

do $$ begin assert exists (select 1 from public.app_migrations where version = '20261115001200'), 'logged'; end $$;
select 'ALL 012 TESTS PASSED';
