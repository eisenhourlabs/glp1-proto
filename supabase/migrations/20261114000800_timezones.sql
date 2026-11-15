-- 008 · Time zones (backlog A16).
-- clinics.timezone (IANA name, set when a clinic is created; existing clinics get America/Chicago) and
-- patients.timezone (from her browser, refreshed when the app loads). clinic_report() and clinic_checkin_list() count
-- "today" in the clinic's zone when no date is given (they used the server's UTC date).
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations

begin;

-- Guard: refuse to run twice.
do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261114000800') then
    raise exception 'Migration 20261114000800 is already applied — nothing to do.';
  end if;
end $$;

-- An IANA zone name Postgres knows (e.g. America/Chicago).
create function public.is_timezone(p_tz text) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  perform now() at time zone p_tz;
  return true;
exception when others then
  return false;
end $$;

alter table public.clinics add column timezone text not null default 'America/Chicago'
  check (public.is_timezone(timezone));
alter table public.patients add column timezone text check (timezone is null or public.is_timezone(timezone));
grant update (timezone) on public.patients to authenticated;

-- Today's date in a clinic's time zone.
create function public.clinic_today(p_clinic uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select c.timezone from public.clinics c where c.id = p_clinic), 'UTC'))::date
$$;

drop function public.clinic_report(uuid, date);
drop function public.clinic_checkin_list(uuid, date);

create function public.clinic_report(p_clinic uuid default null, p_today date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c uuid := public.report_clinic_scope(p_clinic);
  p_day date := coalesce(p_today, public.clinic_today(c));
  r jsonb;
begin
  with pts as (
    select pa.id, pa.status, coalesce(pa.days_per_week, 3) as per_week, pa.start_date
      from public.patients pa join public.profiles pr on pr.id = pa.id
     where pr.clinic_id = c and pr.role = 'patient'
  ), done as (
    select s.patient_id, s.log_date from public.session_logs s join pts on pts.id = s.patient_id
     where s.status in ('done', 'partial') and s.log_date <= p_day
  ), wk as (
    select (date_trunc('week', p_day)::date - 7 * k) as ws from generate_series(0, 7) k
  ), weekly as (
    select wk.ws,
           (select coalesce(sum(p.per_week), 0) from pts p
             where p.status = 'active' and p.start_date is not null and p.start_date <= wk.ws + 6) as planned,
           (select count(*) from done d where d.log_date between wk.ws and wk.ws + 6) as completed
      from wk
  ), loaded as (
    select e.patient_id, e.exercise_id, e.created_at, (e.sets -> -1 ->> 'weight')::numeric as w
      from public.exercise_logs e
      join pts on pts.id = e.patient_id
      join public.content_exercises ce on ce.id = e.exercise_id
       and ce.version = (select v.version from public.content_versions v where v.is_current)
     where not e.skipped and jsonb_array_length(e.sets) > 0 and (e.sets -> -1 ->> 'weight') is not null
       and ce.load_type not in ('band', 'bodyweight')
  ), firstlast as (
    select patient_id, exercise_id,
           (array_agg(w order by created_at))[1] as first_w, (array_agg(w order by created_at desc))[1] as last_w
      from loaded group by patient_id, exercise_id having count(*) >= 2
  )
  select jsonb_build_object(
    'clinic', (select name from public.clinics where id = c),
    'as_of', p_day,
    'enrolled', (select count(*) from pts),
    'activated', (select count(*) from pts where status <> 'onboarding'),
    'active_now', (select count(*) from pts where status = 'active'),
    'active_7d', (select count(distinct patient_id) from done where log_date > p_day - 7),
    'active_28d', (select count(distinct patient_id) from done where log_date > p_day - 28),
    'workouts_28d', (select count(*) from done where log_date > p_day - 28),
    'weekly', (select jsonb_agg(jsonb_build_object('week_start', ws, 'planned', planned, 'completed', completed) order by ws) from weekly),
    'strength', jsonb_build_object(
      'patients_with_data', (select count(distinct patient_id) from firstlast),
      'patients_stronger', (select count(distinct patient_id) from firstlast where last_w > first_w),
      'avg_load_change_pct', (select round(avg((last_w - first_w) / first_w * 100)) from firstlast where first_w > 0))
  ) into r;
  return r;
end $$;

create function public.clinic_checkin_list(p_clinic uuid default null, p_today date default null)
returns table (patient_name text, joined date, status text, last_workout date, days_since integer,
               workouts_this_week integer, workouts_last_week integer, workouts_28d integer,
               last_skip_reason text, last_skip_date date, worth_a_call boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  c uuid := public.report_clinic_scope(p_clinic);
  p_day date := coalesce(p_today, public.clinic_today(c));
  ws date := date_trunc('week', p_day)::date;
begin
  return query
  with pts as (
    select pa.id, pa.status, pa.start_date, pr.display_name, pr.created_at::date as joined
      from public.patients pa join public.profiles pr on pr.id = pa.id
     where pr.clinic_id = c and pr.role = 'patient'
       and exists (select 1 from public.patient_documents d where d.patient_id = pa.id and d.doc_type = 'consent')
  ), s as (
    select p.id,
           max(l.log_date) filter (where l.status in ('done', 'partial')) as last_w,
           count(*) filter (where l.status in ('done', 'partial') and l.log_date >= ws) as this_w,
           count(*) filter (where l.status in ('done', 'partial') and l.log_date >= ws - 7 and l.log_date < ws) as last_wk,
           count(*) filter (where l.status in ('done', 'partial') and l.log_date > p_day - 28) as d28
      from pts p left join public.session_logs l on l.patient_id = p.id and l.log_date <= p_day
     group by p.id
  ), sk as (
    select distinct on (l.patient_id) l.patient_id, l.skip_reason, l.log_date
      from public.session_logs l join pts p on p.id = l.patient_id
     where l.status = 'skipped' and l.skip_reason is not null and l.log_date <= p_day
     order by l.patient_id, l.log_date desc, l.id desc
  )
  select p.display_name::text, p.joined, p.status::text, s.last_w,
         case when s.last_w is null then null else (p_day - s.last_w) end,
         s.this_w::integer, s.last_wk::integer, s.d28::integer,
         sk.skip_reason::text, sk.log_date,
         (p.status = 'active' and coalesce(s.last_w, p.start_date) is not null and p_day - coalesce(s.last_w, p.start_date) >= 7)
    from pts p join s on s.id = p.id left join sk on sk.patient_id = p.id
   order by 11 desc, s.last_w asc nulls first, p.display_name;
end $$;

revoke all on function public.is_timezone(text), public.clinic_today(uuid), public.clinic_report(uuid, date),
                       public.clinic_checkin_list(uuid, date) from public, anon;
grant execute on function public.is_timezone(text) to authenticated, service_role;
revoke all on function public.clinic_today(uuid) from authenticated;
grant execute on function public.clinic_today(uuid) to service_role;
grant execute on function public.clinic_report(uuid, date), public.clinic_checkin_list(uuid, date) to authenticated, service_role;

insert into public.app_migrations (version, name) values ('20261114000800', 'timezones');

commit;
