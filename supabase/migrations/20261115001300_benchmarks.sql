-- 013 · Benchmarks: three short strength tests (backlog B13), built switched off.
-- A patient records a result for each test at her second workout and in every transition week; the progress screen shows
-- first against latest. The table is hers: she reads and adds her own rows (and only while she can train); nobody edits
-- or deletes a result (a new test is a new row). Admins read all rows for support; clinic staff have no access at all
-- (D1 will add an aggregate report function later, like the other clinic reports).
-- The tests, their wording and the on/off switch are not here: the switch is the app_settings row `benchmarks.enabled`
-- (not set = off; see docs/supabase_settings.md) and the placeholder wording is in the app.
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations

begin;

-- Guard: refuse to run twice.
do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261115001300') then
    raise exception 'Migration 20261115001300 is already applied — nothing to do.';
  end if;
end $$;

create table public.benchmarks (
  id          bigint generated always as identity primary key,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  cycle_id    bigint references public.cycles (id) on delete set null,
  moment      text not null check (moment in ('baseline', 'transition')),
  test        text not null check (test in ('lower_body', 'upper_body', 'carry_hold')),
  value       integer not null check (value between 0 and 600),     -- repetitions, or seconds for carry_hold
  variant     text check (variant is null or char_length(variant) between 1 and 40),
  client_ref  uuid unique,                                           -- makes a resent save land once (same idea as C4)
  created_at  timestamptz not null default now()
);
create index benchmarks_patient_idx on public.benchmarks (patient_id, test, created_at);
comment on table public.benchmarks is 'Patient-recorded strength test results (B13). Own rows only; no clinic access.';

alter table public.benchmarks enable row level security;

revoke all on public.benchmarks from anon, authenticated;
grant select, insert on public.benchmarks to authenticated;
grant select, insert, update, delete on public.benchmarks to service_role;

create policy benchmarks_read on public.benchmarks for select to authenticated
  using (patient_id = auth.uid() or public.is_admin());
create policy benchmarks_ins on public.benchmarks for insert to authenticated
  with check (patient_id = auth.uid() and public.can_train());

insert into public.app_migrations (version, name) values ('20261115001300', 'benchmarks');

commit;
