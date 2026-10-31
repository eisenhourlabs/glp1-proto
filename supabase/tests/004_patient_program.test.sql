\set ON_ERROR_STOP on
-- Patient program: a patient sees and writes only her own rows; status changes only via functions;
-- documents are append-only; clinic viewers see nothing; admins read all and resolve flags.

-- fixtures (superuser): patients for pat-a (a1) and pat-b (b1) from the 001 fixtures; a content version for cycles
insert into public.patients (id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1');
insert into public.content_versions (source_file, source_hash) values ('fixture.xlsx', 'fx');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

-- ── patient A ──────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; s text; v int; cid bigint; sid bigint; begin
  select count(*) into n from public.patients; assert n = 1, 'patient sees only her own program row';
  update public.patients set experience = 'none', age_band = '40-49', days_per_week = 3, session_minutes = 45,
    equipment = '{chair,db}', goal = 'everyday_strength' where id = auth.uid();
  begin update public.patients set status = 'active' where id = auth.uid();
    raise exception 'FAIL: patient set her own status';
  exception when insufficient_privilege then null; end;
  begin update public.patients set screening_flag = 'cleared' where id = auth.uid();
    raise exception 'FAIL: patient cleared her own screening flag';
  exception when insufficient_privilege then null; end;
  update public.patients set goal = 'x' where id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count; assert n = 0, 'cannot edit another patient';

  -- onboarding cannot complete before documents are signed
  begin perform public.patient_complete_onboarding();
    raise exception 'FAIL: completed onboarding without documents';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;

  insert into public.patient_documents (patient_id, doc_type, doc_version, signed_name) values
    (auth.uid(), 'consent', 'c1', 'Pat A'), (auth.uid(), 'waiver', 'w1', 'Pat A');
  insert into public.patient_documents (patient_id, doc_type, doc_version, signed_name, answers)
    values (auth.uid(), 'screening', 's1', 'Pat A', '{"chest_pain": true}');
  begin update public.patient_documents set signed_name = 'changed';
    raise exception 'FAIL: patient edited a signed document';
  exception when insufficient_privilege then null; end;
  begin insert into public.patient_documents (patient_id, doc_type, doc_version, signed_name)
      values ('00000000-0000-0000-0000-0000000000b1', 'consent', 'c1', 'Fake');
    raise exception 'FAIL: signed for someone else';
  exception when insufficient_privilege then null; end;

  -- red flag → paused, screening flag raised; self-clear → active
  perform public.patient_set_screening(true);
  select public.patient_complete_onboarding('2026-11-02') into s; assert s = 'paused', 'red flag pauses';
  select count(*) into n from public.flags where type = 'screening'; assert n = 1, 'screening flag raised';
  select public.patient_self_clear('Pat A', 'clear1') into s; assert s = 'active', 'self-clear activates';
  select start_date::text into s from public.patients where id = auth.uid(); assert s = '2026-11-02', 'start date kept';
  perform public.patient_set_screening(false);   -- no effect once past onboarding
  select screening_flag into s from public.patients where id = auth.uid(); assert s = 'cleared', 'flag stays cleared';

  -- cycle + items + logs
  select version into v from public.content_versions limit 1;
  insert into public.cycles (patient_id, cycle_no, template_id, content_version, cycle_type, start_date, session_minutes)
    values (auth.uid(), 1, 'C1-3D', v, 'C1', '2026-11-02', 45) returning id into cid;
  insert into public.cycle_items (cycle_id, patient_id, session, slot, ord, role, pattern, exercise_id)
    values (cid, auth.uid(), 'A', 'P1', 1, 'P', 'SQ', 'SQ01');
  begin
    insert into public.cycles (patient_id, cycle_no, template_id, content_version, cycle_type, start_date, session_minutes)
      values (auth.uid(), 2, 'C1-3D', v, 'C1', '2026-11-02', 45);
    raise exception 'FAIL: two active cycles';
  exception when unique_violation then null; end;
  insert into public.session_logs (patient_id, cycle_id, week, session, log_date, status, energy)
    values (auth.uid(), cid, 1, 'A', '2026-11-02', 'done', 'ok') returning id into sid;
  insert into public.exercise_logs (session_log_id, patient_id, slot, exercise_id, sets, rating)
    values (sid, auth.uid(), 'P1', 'SQ01', '[{"reps": 10}, {"reps": 10}]', 'good');
  insert into public.flags (patient_id, type, detail) values (auth.uid(), 'dizzy', '{"session": "A"}');
  begin insert into public.flags (patient_id, type) values (auth.uid(), 'admin_note');
    raise exception 'FAIL: patient wrote an admin note';
  exception when insufficient_privilege then null; end;
  update public.flags set resolved_at = now();
  get diagnostics n = row_count; assert n = 0, 'patient cannot resolve flags';
  insert into public.adjustments (patient_id, cycle_id, type, reason) values (auth.uid(), cid, 'scale_today', 'low_energy');
end $$;
reset role;

-- ── patient B sees none of A's data and can't attach to A's cycle ───────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ declare n int; cid bigint; begin
  select count(*) into n from public.session_logs;      assert n = 0, 'B sees no logs of A';
  select count(*) into n from public.cycles;            assert n = 0, 'B sees no cycles of A';
  select count(*) into n from public.patient_documents; assert n = 0, 'B sees no documents of A';
  select count(*) into n from public.flags;             assert n = 0, 'B sees no flags of A';
  select id into cid from public.cycles limit 1;
  begin
    insert into public.cycle_items (cycle_id, patient_id, session, slot, ord, role, pattern)
      values ((select min(id) from public.cycles), auth.uid(), 'A', 'P9', 9, 'P', 'SQ');
    raise exception 'FAIL: wrote into another patient''s cycle';
  exception when insufficient_privilege or foreign_key_violation or not_null_violation then null; end;
end $$;
reset role;

-- ── clinic viewer of clinic A sees nothing patient-level ───────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare n int; begin
  select count(*) into n from public.patients;     assert n = 0, 'clinic viewer: no patient rows';
  select count(*) into n from public.session_logs; assert n = 0, 'clinic viewer: no logs';
  select count(*) into n from public.flags;        assert n = 0, 'clinic viewer: no flags';
  begin perform public.patient_complete_onboarding();
    raise exception 'FAIL: clinic viewer ran a patient function';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;

-- ── admin reads everything and resolves flags ──────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ declare n int; begin
  select count(*) into n from public.patients;          assert n = 2, 'admin sees all patients';
  select count(*) into n from public.session_logs;      assert n = 1, 'admin sees logs';
  update public.flags set resolved_at = now(), resolved_by = auth.uid() where type = 'dizzy';
  get diagnostics n = row_count; assert n = 1, 'admin resolves a flag';
end $$;
reset role;

set role anon;
do $$ begin
  begin perform 1 from public.patients; raise exception 'FAIL: anon read patients';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'ALL 004 TESTS PASSED' as result;
