-- 006 · AI cycle review proposals (Framework §14).
-- Apply: Supabase → SQL Editor → paste this whole file → Run. Then: python scripts/admin_cli.py migrations
--
-- One row per finished cycle. The `ai-cycle-review` Edge Function (service role) writes it: the de-identified
-- summary the AI saw, the AI's output (or the default when the AI is off or fails), the validator's result, and the
-- plan that will be applied (`final`). Status:
--   ready     validator passed and within bounds → applied when she starts her next cycle
--   pending   errors or outside the auto-apply bounds → admin queue; `final` is the default meanwhile, so she's never blocked
--   approved  admin accepted the AI plan (final := output)
--   rejected  admin chose the default plan (final := default_output)
-- She reads her own row (recap, plan). She can only record which cycle it was applied to. Admins read all and decide
-- pending rows through admin_review_proposal(). Clinic viewers see nothing.

begin;

do $$ begin
  if exists (select 1 from public.app_migrations where version = '20261031000600') then
    raise exception 'Migration 20261031000600 is already applied — nothing to do.';
  end if;
end $$;

create table public.ai_proposals (
  id                bigint generated always as identity primary key,
  patient_id        uuid not null references public.patients (id) on delete cascade,
  cycle_id          bigint not null references public.cycles (id) on delete cascade,
  created_at        timestamptz not null default now(),
  reflection        jsonb not null default '{}'::jsonb,       -- her chips, focus, days; the optional note stays here (never sent to the AI)
  input_summary     jsonb not null,
  source            text not null check (source in ('ai', 'default')),
  model             text,
  ai_error          text,                                      -- why the AI wasn't used (no key, API error, unusable output)
  output            jsonb not null,                            -- the proposal as produced (AI or default)
  default_output    jsonb not null,
  validation        jsonb not null default '{"errors": [], "review": []}'::jsonb,
  status            text not null check (status in ('ready', 'pending', 'approved', 'rejected')),
  final             jsonb not null,
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz,
  review_note       text check (review_note is null or length(review_note) <= 500),
  applied_cycle_id  bigint references public.cycles (id) on delete set null,
  unique (cycle_id)
);
create index ai_proposals_pending_idx on public.ai_proposals (created_at) where status = 'pending';

-- Admin decision on a pending proposal.
create function public.admin_review_proposal(p_id bigint, p_approve boolean, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  update public.ai_proposals
     set status = case when p_approve then 'approved' else 'rejected' end,
         final = case when p_approve then output else default_output end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_id and status = 'pending'
  returning status into v_status;
  if v_status is null then raise exception 'not a pending proposal'; end if;
  return v_status;
end $$;

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke all on public.ai_proposals from anon, authenticated;
grant select, insert, update, delete on public.ai_proposals to service_role;
grant select on public.ai_proposals to authenticated;
grant update (applied_cycle_id) on public.ai_proposals to authenticated;
revoke all on function public.admin_review_proposal(bigint, boolean, text) from public, anon;
grant execute on function public.admin_review_proposal(bigint, boolean, text) to authenticated, service_role;

alter table public.ai_proposals enable row level security;
create policy proposals_read on public.ai_proposals for select to authenticated using (patient_id = auth.uid() or public.is_admin());
create policy proposals_applied on public.ai_proposals for update to authenticated
  using (patient_id = auth.uid() and applied_cycle_id is null)
  with check (patient_id = auth.uid() and exists (select 1 from public.cycles c where c.id = applied_cycle_id and c.patient_id = auth.uid()));

insert into public.app_migrations (version, name) values ('20261031000600', 'ai_proposals');

commit;
