-- 009 · Hide small numbers in clinic reports (backlog D8).
-- In clinic_report(), any patient count from 1 to report.min_cell − 1 (default 5) is returned as null and listed in
-- "suppressed" (the app shows "fewer than 5"); a clinic with fewer than report.min_cell patients gets no percentages
-- (no weekly rates, no average strength change). clinic_checkin_list() (the consented row per patient) is unchanged.
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations
-- Needs 008 (time zones) applied first.

begin;

-- Guard: refuse to run twice.
do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261114000900') then
    raise exception 'Migration 20261114000900 is already applied — nothing to do.';
  end if;
end $$;

-- The smallest count a clinic report shows (app_settings report.min_cell, default 5).
create function public.report_min_cell() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(s.value) = 'object' then (s.value ->> 'value')::int else (s.value #>> '{}')::int end
                     from public.app_settings s where s.key = 'report.min_cell'), 5)
$$;

-- A count, or null when it is 1 to m − 1.
create function public.small_cell(n bigint, m integer) returns bigint
language sql immutable set search_path = '' as $$
  select case when n between 1 and m - 1 then null else n end
$$;

create or replace function public.clinic_report(p_clinic uuid default null, p_today date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c uuid := public.report_clinic_scope(p_clinic);
  p_day date := coalesce(p_today, public.clinic_today(c));
  m int := public.report_min_cell();
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
  , raw as (
    select (select count(*) from pts) as enrolled,
           (select count(*) from pts where status <> 'onboarding') as activated,
           (select count(*) from pts where status = 'active') as active_now,
           (select count(distinct patient_id) from done where log_date > p_day - 7) as active_7d,
           (select count(distinct patient_id) from done where log_date > p_day - 28) as active_28d,
           (select count(*) from done where log_date > p_day - 28) as workouts_28d,
           (select count(distinct patient_id) from firstlast) as with_data,
           (select count(distinct patient_id) from firstlast where last_w > first_w) as stronger,
           (select round(avg((last_w - first_w) / first_w * 100)) from firstlast where first_w > 0) as avg_change
  )
  -- Small numbers (D8): a patient count of 1 to m − 1 comes back as null and is listed in "suppressed"; the app shows
  -- "fewer than m". A clinic with fewer than m enrolled ("small_clinic") gets no percentages or weekly rates at all.
  select jsonb_build_object(
    'clinic', (select name from public.clinics where id = c),
    'as_of', p_day,
    'min_cell', m,
    'small_clinic', raw.enrolled < m,
    'enrolled', public.small_cell(raw.enrolled, m),
    'activated', public.small_cell(raw.activated, m),
    'active_now', public.small_cell(raw.active_now, m),
    'active_7d', public.small_cell(raw.active_7d, m),
    'active_28d', public.small_cell(raw.active_28d, m),
    'workouts_28d', case when raw.active_28d between 1 and m - 1 then null else raw.workouts_28d end,
    'weekly', case when raw.enrolled < m then '[]'::jsonb else
      (select jsonb_agg(jsonb_build_object('week_start', ws, 'planned', planned, 'completed', completed) order by ws) from weekly) end,
    'strength', jsonb_build_object(
      'patients_with_data', public.small_cell(raw.with_data, m),
      'patients_stronger', case when raw.with_data between 1 and m - 1 then null else public.small_cell(raw.stronger, m) end,
      'avg_load_change_pct', case when raw.with_data < m then null else raw.avg_change end),
    'suppressed', to_jsonb(array_remove(array[
      case when raw.enrolled between 1 and m - 1 then 'enrolled' end,
      case when raw.activated between 1 and m - 1 then 'activated' end,
      case when raw.active_now between 1 and m - 1 then 'active_now' end,
      case when raw.active_7d between 1 and m - 1 then 'active_7d' end,
      case when raw.active_28d between 1 and m - 1 then 'active_28d' end,
      case when raw.with_data between 1 and m - 1 then 'strength' end], null))
  )
    into r from raw;
  return r;
end $$;

revoke all on function public.report_min_cell(), public.small_cell(bigint, integer) from public, anon, authenticated;
grant execute on function public.report_min_cell(), public.small_cell(bigint, integer) to service_role;

insert into public.app_migrations (version, name) values ('20261114000900', 'small_numbers');

commit;
