-- 004 · Patient program: profile/onboarding, signed documents, screening, cycles, logs, flags, adjustments.
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations
--
-- Fitness data only (Brad's spec): no diagnosis, medication, lab or weight fields anywhere.
-- A patient reads and writes only her own rows. Admins read everything. Clinic viewers get NOTHING here
-- (their reports come later through aggregate functions).
-- Status changes (onboarding → active / paused) happen only through the functions at the bottom.

begin;

do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261031000400') then
    raise exception 'Migration 20261031000400 is already applied — nothing to do.';
  end if;
end $$;

-- ── Patient program profile (one row per patient login) ─────────────────────
create table public.patients (
  id                  uuid primary key references public.profiles (id) on delete cascade,
  status              text not null default 'onboarding' check (status in ('onboarding', 'paused', 'active', 'inactive')),
  screening_flag      text not null default 'none' check (screening_flag in ('none', 'pause', 'cleared')),
  experience          text check (experience in ('none', 'some', 'regular')),
  age_band            text check (age_band in ('40-49', '50-59', '60-69', '70+')),
  setup               text,
  equipment           text[] not null default '{}',
  dumbbells_available numeric[] not null default '{}',
  workarounds         text[] not null default '{}',
  restrictions        text[] not null default '{}',
  floor_ok            boolean not null default false,
  days_per_week       smallint check (days_per_week between 2 and 4),
  session_minutes     smallint check (session_minutes in (30, 45, 60)),
  preferred_days      smallint[] not null default '{}',     -- ISO weekdays 1–7
  low_energy_day      smallint check (low_energy_day between 1 and 7),
  reminder_time       time,
  goal                text,
  goal_words          text check (goal_words is null or length(goal_words) <= 280),
  pattern_levels      jsonb not null default '{}'::jsonb,
  workout1_check      jsonb not null default '{}'::jsonb,
  start_date          date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger patients_touch before update on public.patients for each row execute function public.touch_updated_at();

-- ── Signed documents (consent, waiver, screening attestation, clearance) — append-only ──
create table public.patient_documents (
  id           bigint generated always as identity primary key,
  patient_id   uuid not null references public.patients (id) on delete cascade,
  doc_type     text not null check (doc_type in ('consent', 'waiver', 'screening', 'clearance')),
  doc_version  text not null,
  signed_name  text not null check (length(trim(signed_name)) between 2 and 120),
  signed_at    timestamptz not null default now(),
  answers      jsonb,                                  -- screening answers (yes/no + follow-ups), never free-text diagnoses
  user_agent   text
);
create index patient_documents_patient_idx on public.patient_documents (patient_id, doc_type);

-- ── Cycles and their materialized slots ─────────────────────────────────────
create table public.cycles (
  id               bigint generated always as identity primary key,
  patient_id       uuid not null references public.patients (id) on delete cascade,
  cycle_no         smallint not null,
  template_id      text not null,
  content_version  integer not null references public.content_versions (version),
  cycle_type       text not null check (cycle_type in ('C1', 'C2', 'C3')),
  start_date       date not null,
  session_minutes  smallint not null,
  status           text not null default 'active' check (status in ('active', 'done', 'abandoned')),
  week_modes       jsonb not null default '{}'::jsonb,   -- {"4": "consolidate", "9": "light"} with reasons
  created_at       timestamptz not null default now(),
  unique (patient_id, cycle_no)
);
create unique index cycles_one_active on public.cycles (patient_id) where status = 'active';

create table public.cycle_items (
  cycle_id     bigint not null references public.cycles (id) on delete cascade,
  patient_id   uuid not null references public.patients (id) on delete cascade,
  session      text not null,
  slot         text not null,
  ord          smallint not null,
  role         text not null,
  pattern      text not null,
  exercise_id  text,                                   -- null = no option for her (slot skipped)
  reasons      jsonb not null default '[]'::jsonb,
  primary key (cycle_id, session, slot)
);

-- ── Logs ────────────────────────────────────────────────────────────────────
create table public.session_logs (
  id                bigint generated always as identity primary key,
  patient_id        uuid not null references public.patients (id) on delete cascade,
  cycle_id          bigint references public.cycles (id) on delete set null,
  week              smallint check (week between 1 and 9),
  session           text,
  log_date          date not null,
  status            text not null default 'in_progress' check (status in ('in_progress', 'done', 'partial', 'skipped')),
  scaled            boolean not null default false,
  skip_reason       text check (skip_reason in ('busy', 'low_energy', 'not_feeling_well', 'sore', 'travel', 'other')),
  energy            text check (energy in ('low', 'ok', 'good')),
  workaround_areas  text[] not null default '{}',
  feel              text check (feel in ('too_easy', 'right', 'too_hard')),
  soreness          text check (soreness in ('none', 'some', 'a_lot')),
  sore_areas        text[] not null default '{}',
  note              text check (note is null or length(note) <= 500),
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index session_logs_patient_idx on public.session_logs (patient_id, log_date desc);

create table public.exercise_logs (
  id              bigint generated always as identity primary key,
  session_log_id  bigint not null references public.session_logs (id) on delete cascade,
  patient_id      uuid not null references public.patients (id) on delete cascade,
  slot            text not null,
  exercise_id     text not null,
  swapped_from    text,
  swap_reason     text,
  sets            jsonb not null default '[]'::jsonb,   -- [{"weight": 20, "reps": 10}] or [{"seconds": 30}]
  rating          text check (rating in ('easy', 'good', 'hard')),
  skipped         boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (session_log_id, slot)
);
create index exercise_logs_patient_ex_idx on public.exercise_logs (patient_id, exercise_id, created_at desc);

-- ── Flags (problem reports, dizziness, pattern flags) and the adjustment audit trail ──
create table public.flags (
  id           bigint generated always as identity primary key,
  patient_id   uuid not null references public.patients (id) on delete cascade,
  type         text not null check (type in ('problem', 'dizzy', 'pain', 'pattern', 'screening', 'admin_note')),
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id)
);
create index flags_open_idx on public.flags (created_at desc) where resolved_at is null;

create table public.adjustments (
  id          bigint generated always as identity primary key,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  cycle_id    bigint references public.cycles (id) on delete set null,
  type        text not null,
  reason      text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ── Status changes only through these functions ────────────────────────────
-- Finish onboarding: a screening red flag pauses; otherwise active from today (or the chosen start date).
create function public.patient_complete_onboarding(p_start date default current_date) returns text
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if public.my_role() is distinct from 'patient' then raise exception 'patients only'; end if;
  if not exists (select 1 from public.patient_documents where patient_id = auth.uid() and doc_type = 'consent')
     or not exists (select 1 from public.patient_documents where patient_id = auth.uid() and doc_type = 'waiver')
     or not exists (select 1 from public.patient_documents where patient_id = auth.uid() and doc_type = 'screening') then
    raise exception 'consent, waiver and screening must be signed first';
  end if;
  update public.patients
     set status = case when screening_flag = 'pause' then 'paused' else 'active' end,
         start_date = coalesce(start_date, p_start)
   where id = auth.uid() and status in ('onboarding', 'paused')
  returning status into v_status;
  if v_status = 'paused' then
    insert into public.flags (patient_id, type, detail) values (auth.uid(), 'screening', '{"reason":"red flag at screening"}');
  end if;
  return v_status;
end $$;

-- She confirms her provider cleared her (self-attestation, Framework §2 / analysis §2): signs, flag cleared, active.
create function public.patient_self_clear(p_signed_name text, p_doc_version text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then raise exception 'patients only'; end if;
  insert into public.patient_documents (patient_id, doc_type, doc_version, signed_name)
    values (auth.uid(), 'clearance', p_doc_version, p_signed_name);
  update public.patients set screening_flag = 'cleared', status = 'active', start_date = coalesce(start_date, current_date)
   where id = auth.uid() and screening_flag = 'pause';
  return (select status from public.patients where id = auth.uid());
end $$;

-- Screening result: set by the screening step (red flag → 'pause'). Only from onboarding.
create function public.patient_set_screening(p_red_flag boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'patient' then raise exception 'patients only'; end if;
  update public.patients set screening_flag = case when p_red_flag then 'pause' else 'none' end
   where id = auth.uid() and status = 'onboarding';
end $$;

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on public.patients, public.patient_documents, public.cycles, public.cycle_items, public.session_logs,
              public.exercise_logs, public.flags, public.adjustments from anon, authenticated;

grant select on public.patients to authenticated;
grant update (experience, age_band, setup, equipment, dumbbells_available, workarounds, restrictions, floor_ok,
              days_per_week, session_minutes, preferred_days, low_energy_day, reminder_time, goal, goal_words,
              pattern_levels, workout1_check) on public.patients to authenticated;
grant select, insert on public.patient_documents to authenticated;               -- append-only for patients
grant select, insert, update on public.cycles, public.cycle_items to authenticated;
grant select, insert, update, delete on public.session_logs, public.exercise_logs to authenticated;
grant select, insert on public.flags, public.adjustments to authenticated;
grant update (resolved_at, resolved_by) on public.flags to authenticated;          -- admins only, by policy

grant select, insert, update, delete on public.patients, public.patient_documents, public.cycles, public.cycle_items,
      public.session_logs, public.exercise_logs, public.flags, public.adjustments to service_role;

revoke all on function public.patient_complete_onboarding(date), public.patient_self_clear(text, text),
                       public.patient_set_screening(boolean) from public, anon;
grant execute on function public.patient_complete_onboarding(date), public.patient_self_clear(text, text),
                          public.patient_set_screening(boolean) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.patients          enable row level security;
alter table public.patient_documents enable row level security;
alter table public.cycles            enable row level security;
alter table public.cycle_items       enable row level security;
alter table public.session_logs      enable row level security;
alter table public.exercise_logs     enable row level security;
alter table public.flags             enable row level security;
alter table public.adjustments       enable row level security;

create policy patients_own on public.patients for select to authenticated using (id = auth.uid() or public.is_admin());
create policy patients_update_own on public.patients for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Owner policies: her own rows (and only while she is a patient); admins read everything.
create policy docs_read  on public.patient_documents for select to authenticated using (patient_id = auth.uid() or public.is_admin());
create policy docs_write on public.patient_documents for insert to authenticated with check (patient_id = auth.uid());

create policy cycles_read  on public.cycles for select to authenticated using (patient_id = auth.uid() or public.is_admin());
create policy cycles_write on public.cycles for insert to authenticated with check (patient_id = auth.uid());
create policy cycles_upd   on public.cycles for update to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());

create policy items_read  on public.cycle_items for select to authenticated using (patient_id = auth.uid() or public.is_admin());
create policy items_write on public.cycle_items for insert to authenticated
  with check (patient_id = auth.uid() and exists (select 1 from public.cycles c where c.id = cycle_id and c.patient_id = auth.uid()));
create policy items_upd   on public.cycle_items for update to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());

create policy sessions_read on public.session_logs for select to authenticated using (patient_id = auth.uid() or public.is_admin());
create policy sessions_ins  on public.session_logs for insert to authenticated with check (patient_id = auth.uid());
create policy sessions_upd  on public.session_logs for update to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy sessions_del  on public.session_logs for delete to authenticated using (patient_id = auth.uid());

create policy exlogs_read on public.exercise_logs for select to authenticated using (patient_id = auth.uid() or public.is_admin());
create policy exlogs_ins  on public.exercise_logs for insert to authenticated
  with check (patient_id = auth.uid() and exists (select 1 from public.session_logs s where s.id = session_log_id and s.patient_id = auth.uid()));
create policy exlogs_upd  on public.exercise_logs for update to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy exlogs_del  on public.exercise_logs for delete to authenticated using (patient_id = auth.uid());

create policy flags_read on public.flags for select to authenticated using (patient_id = auth.uid() or public.is_admin());
create policy flags_ins  on public.flags for insert to authenticated with check (patient_id = auth.uid() and type in ('problem', 'dizzy', 'pain', 'pattern'));
create policy flags_resolve on public.flags for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy adj_read on public.adjustments for select to authenticated using (patient_id = auth.uid() or public.is_admin());
create policy adj_ins  on public.adjustments for insert to authenticated with check (patient_id = auth.uid());

insert into public.app_migrations (version, name) values ('20261031000400', 'patient_program');

commit;
