-- 003 · Programming content: versioned copies of the master workbook (exercises, setups, templates, slots, warm-ups).
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations
--
-- Content is imported by scripts/import_content.py (service role). Every import creates a new content_version;
-- patients keep the version their cycle started on (Framework §2 / roadmap "content versioning"), so rows are
-- never edited in place. content_activate(v) makes a version current in one transaction.
-- Read access: any signed-in user (it is program content, no personal data). Writes: service role only.

begin;

do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261031000300') then
    raise exception 'Migration 20261031000300 is already applied — nothing to do.';
  end if;
end $$;

create table public.content_versions (
  version      integer generated always as identity primary key,
  imported_at  timestamptz not null default now(),
  source_file  text not null,
  source_hash  text not null,
  note         text,
  is_current   boolean not null default false,
  summary      jsonb not null default '{}'::jsonb
);
create unique index content_versions_one_current on public.content_versions (is_current) where is_current;

create table public.content_exercises (
  version            integer not null references public.content_versions (version) on delete cascade,
  id                 text not null check (id ~ '^[A-Z]{2}[0-9]{2,3}$'),
  name               text not null,
  pattern            text not null check (pattern in ('SQ','HI','SL','HP','VP','HR','VR','CA','CO','BA','HA','AR')),
  level              smallint not null check (level between 1 and 4),
  equipment          text not null,                 -- ';' = all of, '|' = any of
  load_type          text not null check (load_type in ('bodyweight','dumbbell','kettlebell','band','machine','cable','barbell')),
  measure            text not null check (measure in ('reps','time','steps')),
  area_load          jsonb not null,                -- {"knees":0..2, "hips":…, "low_back":…, "upper_back_neck":…, "shoulders":…, "elbows_wrists":…}
  floor              boolean not null,
  restrictions       text[] not null default '{}',
  unilateral         boolean not null,
  muscles_primary    text[] not null default '{}',
  muscles_secondary  text[] not null default '{}',
  cues               text[] not null default '{}',
  media_status       text,
  pinned_substitutes text[] not null default '{}',
  active             boolean not null default true,
  notes              text,
  primary key (version, id)
);

create table public.content_equipment (
  version  integer not null references public.content_versions (version) on delete cascade,
  code     text not null,
  label    text not null,
  primary key (version, code)
);

create table public.content_setups (
  version            integer not null references public.content_versions (version) on delete cascade,
  setup              text not null,
  label              text not null,
  level_ceiling      smallint not null check (level_ceiling between 1 and 4),
  pattern_ceilings   jsonb not null default '{}'::jsonb,
  equipment          text[] not null,
  primary key (version, setup)
);

create table public.content_templates (
  version        integer not null references public.content_versions (version) on delete cascade,
  template_id    text not null,
  cycle_type     text not null check (cycle_type in ('C1','C2','C3')),
  days_per_week  smallint not null check (days_per_week between 2 and 4),
  name           text not null,
  sessions       jsonb not null,                  -- [{"session":"A","name":"Full body A"}, …]
  entry_rule     text,
  active         boolean not null default true,
  primary key (version, template_id)
);

create table public.content_slots (
  version         integer not null,
  template_id     text not null,
  session         text not null check (session ~ '^[A-D]$'),
  slot            text not null check (slot ~ '^[PSFO][0-9]$'),
  ord             smallint not null,
  role            text not null check (role in ('P','S','F','O')),
  pattern         text not null,
  min_minutes     smallint not null check (min_minutes in (30, 45, 60)),
  sets_by_week    smallint[] not null check (array_length(sets_by_week, 1) = 8),
  reps_by_week    text[] not null check (array_length(reps_by_week, 1) = 8),
  rir_by_week     text[] not null check (array_length(rir_by_week, 1) = 8),
  time_range_sec  text,
  rest_sec        smallint not null,
  pair_with       text,
  prefer_ids      text[] not null default '{}',
  note            text,
  primary key (version, template_id, session, slot),
  foreign key (version, template_id) references public.content_templates (version, template_id) on delete cascade
);

create table public.content_warmups (
  version     integer not null references public.content_versions (version) on delete cascade,
  warmup_id   text not null,
  name        text not null,
  setups      text[] not null,
  age_band    text not null,
  moves       jsonb not null,                       -- [{"move":…, "dose":…, "cue":…}, …] in order
  primary key (version, warmup_id)
);

-- Make one version current, atomically. Service role only (the importer calls it via RPC).
create function public.content_activate(p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.content_versions where version = p_version) then
    raise exception 'content version % does not exist', p_version;
  end if;
  update public.content_versions set is_current = false where is_current and version <> p_version;
  update public.content_versions set is_current = true where version = p_version;
end $$;

-- The current version number (null before the first import).
create function public.content_current_version() returns integer
language sql stable security definer set search_path = '' as $$
  select version from public.content_versions where is_current
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on public.content_versions, public.content_exercises, public.content_equipment, public.content_setups,
              public.content_templates, public.content_slots, public.content_warmups from anon, authenticated;
grant select on public.content_versions, public.content_exercises, public.content_equipment, public.content_setups,
                public.content_templates, public.content_slots, public.content_warmups to authenticated;
grant select, insert, update, delete on public.content_versions, public.content_exercises, public.content_equipment,
                public.content_setups, public.content_templates, public.content_slots, public.content_warmups to service_role;

revoke all on function public.content_activate(integer) from public, anon, authenticated;
grant execute on function public.content_activate(integer) to service_role;
revoke all on function public.content_current_version() from public, anon;
grant execute on function public.content_current_version() to authenticated, service_role;

-- ── RLS: signed-in users read; nobody but the service role writes ───────────
alter table public.content_versions  enable row level security;
alter table public.content_exercises enable row level security;
alter table public.content_equipment enable row level security;
alter table public.content_setups    enable row level security;
alter table public.content_templates enable row level security;
alter table public.content_slots     enable row level security;
alter table public.content_warmups   enable row level security;

create policy content_versions_read  on public.content_versions  for select to authenticated using (true);
create policy content_exercises_read on public.content_exercises for select to authenticated using (true);
create policy content_equipment_read on public.content_equipment for select to authenticated using (true);
create policy content_setups_read    on public.content_setups    for select to authenticated using (true);
create policy content_templates_read on public.content_templates for select to authenticated using (true);
create policy content_slots_read     on public.content_slots     for select to authenticated using (true);
create policy content_warmups_read   on public.content_warmups   for select to authenticated using (true);

insert into public.app_migrations (version, name) values ('20261031000300', 'content');

commit;
