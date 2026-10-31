-- 002 · Migration log: every migration records itself here, so we can always tell which have been applied.
--
-- Migrations are applied by pasting each file into Supabase → SQL Editor, in filename order (no Node / CLI).
-- From this migration on, every file:
--   1. starts with a guard that refuses to run twice, and
--   2. ends by inserting its own version into public.app_migrations.
-- `python scripts/admin_cli.py migrations` compares this table with the files in supabase/migrations/.
-- If the Supabase CLI is adopted later, see docs/node_cli_later.md (mark these versions applied with
-- `supabase migration repair --status applied <version>`).

begin;

create table public.app_migrations (
  version     text primary key check (version ~ '^[0-9]{14}$'),
  name        text not null,
  applied_at  timestamptz not null default now()
);

revoke all on public.app_migrations from anon, authenticated;
grant select on public.app_migrations to authenticated;
grant select, insert, update, delete on public.app_migrations to service_role;

alter table public.app_migrations enable row level security;
create policy app_migrations_admin_read on public.app_migrations
  for select to authenticated using (public.is_admin());

-- 001 was applied before this log existed.
insert into public.app_migrations (version, name) values
  ('20261031000100', 'core_access'),
  ('20261031000200', 'migration_log');

commit;
