-- 001 · Core access: clinics, clinic codes, profiles (roles), app settings, role helpers, RLS.
--
-- Roles
--   patient        sees only her own rows
--   admin          operator (Brad / Troy) — full access through RLS
--   clinic_viewer  clinic staff — may read its own clinic's branding row here; all reporting
--                  goes through report FUNCTIONS added in later migrations, never tables
--
-- Everything is created with RLS enabled. anon gets nothing except the enrollment
-- code lookup function. Applied with the Supabase CLI (`supabase db push`).

begin;

-- ── Types ──────────────────────────────────────────────────────────────────
create type public.app_role as enum ('patient', 'admin', 'clinic_viewer');

-- ── Tables ─────────────────────────────────────────────────────────────────
create table public.clinics (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 2 and 120),
  short_name    text check (short_name is null or length(short_name) <= 40),
  logo_path     text,                       -- path in the 'branding' storage bucket (later migration)
  accent_color  text check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  status        text not null default 'active' check (status in ('active', 'paused', 'closed')),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.clinic_codes (
  code        text primary key check (code ~ '^[A-Z0-9-]{4,24}$'),
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  active      boolean not null default true,
  expires_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);
create index clinic_codes_clinic_idx on public.clinic_codes (clinic_id);

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.app_role not null default 'patient',
  clinic_id     uuid references public.clinics (id) on delete restrict,
  display_name  text check (display_name is null or length(display_name) <= 80),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_clinic_required check (role = 'admin' or clinic_id is not null)
);
create index profiles_clinic_idx on public.profiles (clinic_id);

create table public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null,
  note        text,
  updated_at  timestamptz not null default now()
);

-- ── updated_at trigger ─────────────────────────────────────────────────────
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger clinics_touch      before update on public.clinics      for each row execute function public.touch_updated_at();
create trigger profiles_touch     before update on public.profiles     for each row execute function public.touch_updated_at();
create trigger app_settings_touch before update on public.app_settings for each row execute function public.touch_updated_at();

-- ── Role helpers (SECURITY DEFINER so policies can read profiles without recursion) ──
create function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false)
$$;

create function public.my_clinic_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.clinic_id from public.profiles p where p.id = auth.uid()
$$;

-- Enrollment page: look up a clinic's public branding by code (no login needed).
-- Returns nothing for unknown, inactive or expired codes, or non-active clinics.
create function public.clinic_branding_for_code(p_code text)
returns table (clinic_name text, short_name text, accent_color text, logo_path text)
language sql stable security definer set search_path = '' as $$
  select c.name, c.short_name, c.accent_color, c.logo_path
  from public.clinic_codes k
  join public.clinics c on c.id = k.clinic_id
  where k.code = upper(trim(p_code))
    and k.active
    and (k.expires_at is null or k.expires_at > now())
    and c.status = 'active'
$$;

-- ── Privileges (defense in depth on top of RLS) ────────────────────────────
revoke all on public.clinics, public.clinic_codes, public.profiles, public.app_settings from anon;
revoke all on public.clinics, public.clinic_codes, public.profiles, public.app_settings from authenticated;

-- service_role (operator scripts, Edge Functions) gets explicit grants: the project is created with
-- "Automatically expose new tables" OFF, so nothing is granted implicitly to any API role.
grant select, insert, update, delete on public.clinics, public.clinic_codes, public.profiles, public.app_settings to service_role;
grant execute on function public.my_role(), public.is_admin(), public.my_clinic_id(), public.clinic_branding_for_code(text) to service_role;

grant select, insert, update, delete on public.clinics, public.clinic_codes, public.app_settings to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;   -- only column a user may change on her own row

revoke all on function public.my_role(), public.is_admin(), public.my_clinic_id() from public, anon;
grant execute on function public.my_role(), public.is_admin(), public.my_clinic_id() to authenticated;
revoke all on function public.clinic_branding_for_code(text) from public;
grant execute on function public.clinic_branding_for_code(text) to anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ── Row-level security ─────────────────────────────────────────────────────
alter table public.clinics      enable row level security;
alter table public.clinic_codes enable row level security;
alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;

-- clinics: admin full; a patient or clinic viewer can read their own clinic's row (branding)
create policy clinics_admin_all on public.clinics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy clinics_read_own on public.clinics
  for select to authenticated using (id = public.my_clinic_id());

-- clinic_codes: admin only
create policy clinic_codes_admin_all on public.clinic_codes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: read own row or (admin) all rows; update own display_name only (column grant above).
-- Creating profiles and changing role/clinic happens through the service role (scripts / Edge Functions).
create policy profiles_read_own on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- app_settings: any signed-in user reads; admin writes
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);
create policy app_settings_admin_write on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;
