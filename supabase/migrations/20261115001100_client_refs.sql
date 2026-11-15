-- 011 · Workouts that survive a bad signal (backlog C4).
-- The patient app makes an id for each workout, flag and adjustment it records (client_ref) and saves writes on the
-- phone when there is no signal, then sends them when it's back. client_ref is unique, so sending the same write twice
-- (signal lost after the server saved it) stores it once: the app inserts with "on conflict (client_ref) do nothing".
-- No new table and no policy change: the columns inherit each table's grants and policies (patients insert their own
-- rows only, and only while they can train, migration 007).
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations

begin;

-- Guard: refuse to run twice.
do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261115001100') then
    raise exception 'Migration 20261115001100 is already applied — nothing to do.';
  end if;
end $$;

alter table public.session_logs add column client_ref uuid unique;
alter table public.flags        add column client_ref uuid unique;
alter table public.adjustments  add column client_ref uuid unique;
comment on column public.session_logs.client_ref is 'Made by the patient app; makes a resent write land once (C4).';
comment on column public.flags.client_ref is 'Made by the patient app; makes a resent write land once (C4).';
comment on column public.adjustments.client_ref is 'Made by the patient app; makes a resent write land once (C4).';

insert into public.app_migrations (version, name) values ('20261115001100', 'client_refs');

commit;
