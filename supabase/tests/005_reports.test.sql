\set ON_ERROR_STOP on
-- Reports: a clinic viewer gets only her own clinic's aggregates and consented list (no table access);
-- admins name a clinic; patients get nothing; admin status changes are logged.

-- fixtures (superuser). State from 004: a1 (clinic A) active, consented, one workout on 2026-11-02; b1 (clinic B).
update public.profiles set role = 'patient' where id = '00000000-0000-0000-0000-0000000000a2';   -- 001 made her a viewer
insert into public.patients (id, status, days_per_week, start_date) values ('00000000-0000-0000-0000-0000000000a2', 'active', 2, '2026-11-02');
update public.patients set status = 'active', days_per_week = 3, start_date = '2026-11-02' where id = '00000000-0000-0000-0000-0000000000b1';
insert into public.patient_documents (patient_id, doc_type, doc_version, signed_name)
  values ('00000000-0000-0000-0000-0000000000b1', 'consent', 'c1', 'Pat B');            -- a2 has NOT consented
update public.patients set days_per_week = 3 where id = '00000000-0000-0000-0000-0000000000a1';
insert into public.session_logs (patient_id, week, session, log_date, status, skip_reason) values
  ('00000000-0000-0000-0000-0000000000a1', 1, 'B', '2026-11-04', 'done', null),
  ('00000000-0000-0000-0000-0000000000a1', 2, 'A', '2026-11-09', 'skipped', 'busy'),
  ('00000000-0000-0000-0000-0000000000a1', 2, 'A', '2026-11-10', 'partial', null),
  ('00000000-0000-0000-0000-0000000000a2', 1, 'A', '2026-11-03', 'done', null),
  ('00000000-0000-0000-0000-0000000000b1', 1, 'A', '2026-11-05', 'done', null);
insert into public.content_exercises (version, id, name, pattern, level, equipment, load_type, measure, area_load, floor, unilateral)
  values (public.content_current_version(), 'SQ04', 'Goblet Box Squat', 'SQ', 2, 'db', 'dumbbell', 'reps', '{}', false, false);
insert into public.exercise_logs (session_log_id, patient_id, slot, exercise_id, sets, created_at)
  select id, patient_id, 'P1', 'SQ04', case when log_date = '2026-11-04' then '[{"weight":10,"reps":12}]'::jsonb else '[{"weight":15,"reps":10}]'::jsonb end,
         log_date::timestamptz
    from public.session_logs where patient_id = '00000000-0000-0000-0000-0000000000a1' and log_date in ('2026-11-04', '2026-11-10');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

-- ── clinic viewer of clinic A ──────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare r jsonb; n int; rec record; begin
  r := public.clinic_report(null, '2026-11-12');
  assert r->>'clinic' = 'Clinic A', 'own clinic';
  assert (r->>'enrolled')::int = 2, format('two patients enrolled in A: %s', r);
  assert (r->>'active_7d')::int = 1, 'one worked out in the last 7 days';
  assert (r->>'workouts_28d')::int = 4, 'four workouts in A (a1 x3, a2 x1), not B''s';
  assert jsonb_array_length(r->'weekly') = 8, 'eight weeks of trend';
  assert (r->'weekly'->-1->>'completed')::int = 1 and (r->'weekly'->-1->>'planned')::int = 5, 'this week: 1 of 3+2 planned';
  assert (r->'strength'->>'patients_stronger')::int = 1 and (r->'strength'->>'avg_load_change_pct')::int = 50, 'strength trend';

  r := public.clinic_report('10000000-0000-0000-0000-00000000000b', '2026-11-12');
  assert r->>'clinic' = 'Clinic A', 'a clinic viewer cannot ask for another clinic';

  select count(*) into n from public.clinic_checkin_list(null, '2026-11-12'); assert n = 1, 'only consented patients are listed';
  select * into rec from public.clinic_checkin_list(null, '2026-11-12');
  assert rec.last_workout = '2026-11-10' and rec.days_since = 2, format('engagement row: %s', row_to_json(rec));
  assert rec.workouts_this_week = 1 and rec.workouts_last_week = 2 and rec.last_skip_reason = 'busy', 'counts and skip reason';
  assert not rec.worth_a_call, 'trained 2 days ago';
  select worth_a_call into rec from public.clinic_checkin_list(null, '2026-11-20');
  assert rec.worth_a_call, '10 days without a workout → call';

  select count(*) into n from public.patients; assert n = 0, 'still no table access';
  begin perform public.admin_set_patient_status('00000000-0000-0000-0000-0000000000a1', 'paused');
    raise exception 'FAIL: clinic viewer changed a status';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.report_clinic_scope(null);
    raise exception 'FAIL: helper callable directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── a patient gets no reports ──────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin perform public.clinic_report(null);
    raise exception 'FAIL: patient read a clinic report';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform * from public.clinic_checkin_list(null);
    raise exception 'FAIL: patient read the check-in list';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;

-- ── admin: names a clinic; changes status (logged); can't skip onboarding ───
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ declare r jsonb; s text; n int; begin
  begin perform public.clinic_report(null);
    raise exception 'FAIL: admin report without a clinic';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  r := public.clinic_report('10000000-0000-0000-0000-00000000000b', '2026-11-12');
  assert r->>'clinic' = 'Clinic B' and (r->>'enrolled')::int = 1, 'admin reads clinic B';

  begin update public.patients set status = 'paused' where id = '00000000-0000-0000-0000-0000000000a2';
    raise exception 'FAIL: admin changed status directly';
  exception when insufficient_privilege then null; end;
  select public.admin_set_patient_status('00000000-0000-0000-0000-0000000000a2', 'paused', 'Called clinic') into s;
  assert s = 'paused';
  select public.admin_set_patient_status('00000000-0000-0000-0000-0000000000a2', 'active', 'Clinic cleared her') into s;
  select count(*) into n from public.adjustments where patient_id = '00000000-0000-0000-0000-0000000000a2' and type = 'status';
  assert n = 2, 'both changes logged';
  begin perform public.admin_set_patient_status('00000000-0000-0000-0000-0000000000a2', 'onboarding');
    raise exception 'FAIL: bad status accepted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;

-- a screening pause is cleared by an admin resume
update public.patients set status = 'paused', screening_flag = 'pause' where id = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.admin_set_patient_status('00000000-0000-0000-0000-0000000000a2', 'active', 'cleared') is not null;
reset role;
do $$ begin
  assert (select screening_flag from public.patients where id = '00000000-0000-0000-0000-0000000000a2') = 'cleared', 'screening cleared';
end $$;
update public.patients set status = 'onboarding' where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin perform public.admin_set_patient_status('00000000-0000-0000-0000-0000000000b1', 'active');
    raise exception 'FAIL: activated someone mid-onboarding';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;

set role anon;
do $$ begin
  begin perform public.clinic_report(null); raise exception 'FAIL: anon report';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'ALL 005 TESTS PASSED' as result;
