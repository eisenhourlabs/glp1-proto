-- 010 · Equipment offered only for some setups (backlog B5, content version 2).
-- Adds content_equipment.only_setups: when filled, onboarding lists that item only for those setups (for example the
-- new gym machines appear for gym setups only); empty = every setup, which is what all existing rows get.
-- No new table and no policy change: the column inherits the table's grants and its read policy.
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations
-- Paste this BEFORE importing content version 2 (the importer stops if the column is missing).

begin;

-- Guard: refuse to run twice.
do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261115001000') then
    raise exception 'Migration 20261115001000 is already applied — nothing to do.';
  end if;
end $$;

alter table public.content_equipment add column only_setups text[] not null default '{}';
comment on column public.content_equipment.only_setups is
  'Setup ids that onboarding offers this item for; empty = every setup (workbook equipment sheet, only_setups).';

insert into public.app_migrations (version, name) values ('20261115001000', 'equipment_only_setups');

commit;
