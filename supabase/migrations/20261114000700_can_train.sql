-- 007 · Make "inactive" and "closed" real (backlog A12).
-- An inactive patient, or a patient of a closed clinic, can still read her own rows (so she can export) but can't write
-- new workouts, cycles, flags or adjustments. public.can_train() is added to every patient insert/update policy.
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations

begin;

-- Guard: refuse to run twice.
do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261114000700') then
    raise exception 'Migration 20261114000700 is already applied — nothing to do.';
  end if;
end $$;

create function public.can_train() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.patients pa
      join public.profiles pr on pr.id = pa.id
      left join public.clinics c on c.id = pr.clinic_id
     where pa.id = auth.uid() and pa.status in ('onboarding', 'active', 'paused') and coalesce(c.status, 'active') <> 'closed')
$$;
revoke all on function public.can_train() from public, anon;
grant execute on function public.can_train() to authenticated, service_role;

drop policy cycles_write on public.cycles;
drop policy cycles_upd on public.cycles;
drop policy items_write on public.cycle_items;
drop policy items_upd on public.cycle_items;
drop policy sessions_ins on public.session_logs;
drop policy sessions_upd on public.session_logs;
drop policy exlogs_ins on public.exercise_logs;
drop policy exlogs_upd on public.exercise_logs;
drop policy flags_ins on public.flags;
drop policy adj_ins on public.adjustments;

create policy cycles_write on public.cycles for insert to authenticated with check (patient_id = auth.uid() and public.can_train());
create policy cycles_upd   on public.cycles for update to authenticated
  using (patient_id = auth.uid() and public.can_train()) with check (patient_id = auth.uid() and public.can_train());
create policy items_write on public.cycle_items for insert to authenticated
  with check (patient_id = auth.uid() and public.can_train()
              and exists (select 1 from public.cycles c where c.id = cycle_id and c.patient_id = auth.uid()));
create policy items_upd   on public.cycle_items for update to authenticated
  using (patient_id = auth.uid() and public.can_train()) with check (patient_id = auth.uid() and public.can_train());
create policy sessions_ins on public.session_logs for insert to authenticated with check (patient_id = auth.uid() and public.can_train());
create policy sessions_upd on public.session_logs for update to authenticated
  using (patient_id = auth.uid() and public.can_train()) with check (patient_id = auth.uid() and public.can_train());
create policy exlogs_ins on public.exercise_logs for insert to authenticated
  with check (patient_id = auth.uid() and public.can_train()
              and exists (select 1 from public.session_logs s where s.id = session_log_id and s.patient_id = auth.uid()));
create policy exlogs_upd on public.exercise_logs for update to authenticated
  using (patient_id = auth.uid() and public.can_train()) with check (patient_id = auth.uid() and public.can_train());
create policy flags_ins on public.flags for insert to authenticated
  with check (patient_id = auth.uid() and public.can_train() and type in ('problem', 'dizzy', 'pain', 'pattern'));
create policy adj_ins on public.adjustments for insert to authenticated with check (patient_id = auth.uid() and public.can_train());

insert into public.app_migrations (version, name) values ('20261114000700', 'can_train');

commit;
