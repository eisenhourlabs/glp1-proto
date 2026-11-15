-- 012 · Error reporting (backlog A14).
-- The three apps report a script error or an unhandled promise rejection to the `client-error` Edge Function, which
-- stores it here through record_client_error(). Nothing identifies a person: no user id, no IP address, no query string
-- (the Edge Function and this function both trim and redact), and the app sends only the browser's own error text.
-- The same error is stored once and counted (fingerprint), so a bug hitting many phones is one row with a count.
-- Admins can read the table; nobody else can, and only the service role can write (through the function).
--
-- Limits: the function takes at most errors.max_per_minute calls a minute in total (app_settings, default 60), keeps
-- at most 5000 distinct errors, and drops errors not seen for 90 days.
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations
-- Then deploy the Edge Functions `client-error` and `health` (docs/supabase_settings.md).

begin;

-- Guard: refuse to run twice.
do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261115001200') then
    raise exception 'Migration 20261115001200 is already applied — nothing to do.';
  end if;
end $$;

create table public.client_errors (
  id           bigint generated always as identity primary key,
  fingerprint  text not null unique,
  app          text not null check (app in ('patient', 'admin', 'clinic', 'join')),
  role         text check (role in ('patient', 'admin', 'clinic_viewer')),
  message      text not null check (char_length(message) <= 300),
  stack        text check (char_length(stack) <= 2000),
  path         text not null check (char_length(path) <= 200),
  app_version  text not null check (char_length(app_version) <= 40),
  count        integer not null default 1,
  created_at   timestamptz not null default now(),    -- first time this error was seen
  last_seen_at timestamptz not null default now()
);
comment on table public.client_errors is 'Browser errors from the apps (A14): no user id, one row per distinct error with a count. Admin read only.';
create index client_errors_last_seen on public.client_errors (last_seen_at desc);

-- Calls per minute, all callers together (the rate limit).
create table public.client_error_budget (
  minute timestamptz primary key,
  calls  integer not null default 0
);

revoke all on public.client_errors, public.client_error_budget from anon, authenticated;
grant select on public.client_errors to authenticated;
grant select, insert, update, delete on public.client_errors, public.client_error_budget to service_role;

alter table public.client_errors enable row level security;
alter table public.client_error_budget enable row level security;
create policy client_errors_admin_read on public.client_errors for select to authenticated using (public.is_admin());
-- client_error_budget: RLS on and no policy, so only the service role (which bypasses RLS) can touch it.

-- The calls-per-minute limit (app_settings errors.max_per_minute, default 60).
create function public.client_error_limit() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(s.value) = 'object' then (s.value ->> 'value')::int else (s.value #>> '{}')::int end
                     from public.app_settings s where s.key = 'errors.max_per_minute'), 60)
$$;

/**
 * Store or count one error. Returns 'stored', 'counted' (seen before), 'limited' (over the per-minute limit) or
 * 'full' (5000 distinct errors already). Only the service role may call it (the Edge Function does).
 */
create function public.record_client_error(p_app text, p_role text, p_message text, p_stack text, p_path text, p_version text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_calls integer;
  v_msg text := left(coalesce(nullif(btrim(p_message), ''), 'Unknown error'), 300);
  v_stack text := left(nullif(btrim(coalesce(p_stack, '')), ''), 2000);
  v_path text := left(coalesce(nullif(p_path, ''), '/'), 200);
  v_ver text := left(coalesce(nullif(p_version, ''), 'unknown'), 40);
  v_role text := case when p_role in ('patient', 'admin', 'clinic_viewer') then p_role else null end;
  v_fp text;
  v_n bigint;
begin
  if p_app not in ('patient', 'admin', 'clinic', 'join') then raise exception 'unknown app'; end if;

  insert into public.client_error_budget (minute, calls) values (date_trunc('minute', now()), 1)
    on conflict (minute) do update set calls = public.client_error_budget.calls + 1
    returning calls into v_calls;
  if v_calls > public.client_error_limit() then return 'limited'; end if;
  delete from public.client_error_budget where minute < now() - interval '1 hour';

  v_fp := md5(concat_ws('|', p_app, v_ver, v_path, v_msg, split_part(coalesce(v_stack, ''), E'\n', 1), split_part(coalesce(v_stack, ''), E'\n', 2)));
  update public.client_errors set count = count + 1, last_seen_at = now() where fingerprint = v_fp;
  if found then return 'counted'; end if;

  delete from public.client_errors where last_seen_at < now() - interval '90 days';
  select count(*) into v_n from public.client_errors;
  if v_n >= 5000 then return 'full'; end if;
  insert into public.client_errors (fingerprint, app, role, message, stack, path, app_version)
    values (v_fp, p_app, v_role, v_msg, v_stack, v_path, v_ver)
    on conflict (fingerprint) do update set count = public.client_errors.count + 1, last_seen_at = now();
  return 'stored';
end $$;

revoke all on function public.record_client_error(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.client_error_limit() from public, anon, authenticated;
grant execute on function public.record_client_error(text, text, text, text, text, text) to service_role;
grant execute on function public.client_error_limit() to service_role;

insert into public.app_migrations (version, name) values ('20261115001200', 'client_errors');

commit;
