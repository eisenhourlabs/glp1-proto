-- Minimal stand-in for the pieces of a Supabase database our migrations depend on,
-- so migrations + RLS can be tested against a throwaway local Postgres.
-- NOT applied to Supabase — the real project already has all of this.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Same contract as Supabase: the user id comes from the JWT 'sub' claim.
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
