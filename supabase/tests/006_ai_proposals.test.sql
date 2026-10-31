\set ON_ERROR_STOP on
-- AI proposals: written by the service role only; a patient reads her own and can only record which cycle it was
-- applied to; admins read all and decide pending ones; clinic viewers and anon see nothing.

-- fixtures: a cycle for a1 already exists (004). Add a cycle for b1 and one proposal each (as the service role).
set role service_role;
do $$ declare ca bigint; cb bigint; v int; begin
  select id into ca from public.cycles where patient_id = '00000000-0000-0000-0000-0000000000a1' limit 1;
  select version into v from public.content_versions limit 1;
  insert into public.cycles (patient_id, cycle_no, template_id, content_version, cycle_type, start_date, session_minutes)
    values ('00000000-0000-0000-0000-0000000000b1', 1, 'C1-3D', v, 'C1', '2026-09-07', 45) returning id into cb;
  insert into public.ai_proposals (patient_id, cycle_id, input_summary, source, output, default_output, status, final)
  values ('00000000-0000-0000-0000-0000000000a1', ca, '{}', 'ai', '{"cycle_type":"C2","recap":"ai"}', '{"cycle_type":"C2","recap":"default"}', 'pending', '{"cycle_type":"C2","recap":"default"}'),
         ('00000000-0000-0000-0000-0000000000b1', cb, '{}', 'default', '{"recap":"d"}', '{"recap":"d"}', 'ready', '{"recap":"d"}');
end $$;
reset role;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

-- ── patient A ──────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; c2 bigint; v int; begin
  select count(*) into n from public.ai_proposals; assert n = 1, 'sees only her own proposal';
  begin insert into public.ai_proposals (patient_id, cycle_id, input_summary, source, output, default_output, status, final)
      select auth.uid(), cycle_id, '{}', 'ai', '{}', '{}', 'ready', '{}' from public.ai_proposals;
    raise exception 'FAIL: patient wrote a proposal';
  exception when insufficient_privilege then null; end;
  begin update public.ai_proposals set status = 'approved';
    raise exception 'FAIL: patient approved her own proposal';
  exception when insufficient_privilege then null; end;
  begin update public.ai_proposals set final = '{"cycle_type":"C3"}';
    raise exception 'FAIL: patient changed the plan';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_review_proposal((select id from public.ai_proposals), true);
    raise exception 'FAIL: patient ran the admin review';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  -- she starts her next cycle and records it
  select content_version into v from public.cycles where patient_id = auth.uid() limit 1;
  update public.cycles set status = 'done' where patient_id = auth.uid() and status = 'active';
  insert into public.cycles (patient_id, cycle_no, template_id, content_version, cycle_type, start_date, session_minutes)
    values (auth.uid(), 2, 'C2-3D', v, 'C2', '2026-11-09', 45) returning id into c2;
  update public.ai_proposals set applied_cycle_id = c2;
  get diagnostics n = row_count; assert n = 1, 'records the applied cycle';
  update public.ai_proposals set applied_cycle_id = c2;
  get diagnostics n = row_count; assert n = 0, 'only once';
end $$;
reset role;

-- B can't point her proposal at A's cycle
select set_config('test.a_cycle', (select max(id)::text from public.cycles where patient_id = '00000000-0000-0000-0000-0000000000a1'), false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  begin update public.ai_proposals set applied_cycle_id = current_setting('test.a_cycle')::bigint;
    raise exception 'FAIL: linked another patient''s cycle';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
reset role;

-- ── clinic viewer: nothing ─────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare n int; begin
  select count(*) into n from public.ai_proposals; assert n = 0, 'clinic viewer sees no proposals';
end $$;
reset role;

-- ── admin: reads all, decides pending ones once ────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ declare n int; s text; f jsonb; begin
  select count(*) into n from public.ai_proposals; assert n = 2, 'admin sees all';
  select public.admin_review_proposal(id, false, 'too fast') into s from public.ai_proposals where status = 'pending';
  assert s = 'rejected';
  select final into f from public.ai_proposals where status = 'rejected';
  assert f->>'recap' = 'default', 'rejecting applies the default plan';
  begin perform public.admin_review_proposal((select id from public.ai_proposals where status = 'ready'), true);
    raise exception 'FAIL: decided a non-pending proposal';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin update public.ai_proposals set status = 'approved';
    raise exception 'FAIL: admin bypassed the review function';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set role anon;
do $$ begin
  begin perform 1 from public.ai_proposals; raise exception 'FAIL: anon read proposals';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select 'ALL 006 TESTS PASSED' as result;
