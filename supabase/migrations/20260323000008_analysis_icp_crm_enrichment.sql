-- Website analysis, ICP lifecycle, CRM activity, discovery provenance, enrichment, scoring.

alter table public.icp_profiles
  add column status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  add column source text not null default 'manual' check (source in ('manual', 'website_analysis', 'existing_customers', 'successful_prospects', 'ai_discovery')),
  add column recommendation jsonb not null default '{}'::jsonb,
  add column search_filters jsonb not null default '{}'::jsonb,
  add column quality jsonb not null default '{}'::jsonb,
  add column archived_at timestamptz,
  add column activated_at timestamptz,
  add column duplicated_from uuid references public.icp_profiles (id) on delete set null;

alter table public.prospects
  add column phone text,
  add column department text,
  add column seniority text,
  add column location text,
  add column linkedin_url text,
  add column source text,
  add column tags text[] not null default '{}',
  add column email_verified boolean not null default false,
  add column merged_into_prospect_id uuid references public.prospects (id) on delete set null;

alter table public.discovery_searches
  add column provider text,
  add column kind text check (kind in ('company', 'contact')),
  add column estimated_credits integer,
  add column consumed_credits integer not null default 0,
  add column error_code text,
  add column error_detail text,
  add column result_count integer not null default 0;

alter table public.discovery_search_results
  add column provider text,
  add column provider_record_id text,
  add column retrieved_at timestamptz,
  add column original_source text,
  add column confidence text,
  add column usage_restrictions text,
  add column entity_kind text check (entity_kind in ('company', 'contact'));

create table public.website_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  submitted_url text not null,
  normalized_domain text,
  company_name text,
  instructions text,
  extracted_content jsonb not null default '{}'::jsonb,
  crawled_urls jsonb not null default '[]'::jsonb,
  ai_output jsonb,
  ai_model text,
  usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed')),
  error_code text,
  error_detail text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code text not null,
  label text not null,
  position integer not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pipeline_stages_unique unique (workspace_id, code)
);

create table public.prospect_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.prospect_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  activity_type text not null check (activity_type in (
    'prospect_created',
    'prospect_updated',
    'assigned',
    'status_changed',
    'enrichment_requested',
    'enrichment_completed',
    'email_generated',
    'email_sent',
    'email_response_received',
    'campaign_enrollment',
    'meeting_booked',
    'note_added',
    'prospect_merged'
  )),
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.prospect_merges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  surviving_prospect_id uuid not null references public.prospects (id) on delete cascade,
  merged_prospect_id uuid not null references public.prospects (id) on delete cascade,
  match_reason text not null,
  confidence text not null check (confidence in ('likely', 'uncertain')),
  snapshot jsonb not null,
  merged_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  provider text,
  error_code text,
  error_detail text,
  credits_consumed integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.enrichment_field_values (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  job_id uuid references public.enrichment_jobs (id) on delete set null,
  field_name text not null,
  field_value text not null,
  source text not null,
  verified boolean not null default false,
  retrieved_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.scoring_configs (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  weights jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.prospect_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  icp_profile_id uuid references public.icp_profiles (id) on delete set null,
  scoring_version text not null,
  score integer check (score is null or (score >= 0 and score <= 100)),
  category text not null,
  positive_factors jsonb not null default '[]'::jsonb,
  negative_factors jsonb not null default '[]'::jsonb,
  explanation text not null,
  ai_explanation text,
  recommended_action text not null,
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index website_analyses_workspace_idx on public.website_analyses (workspace_id, created_at desc);
create index prospect_activities_prospect_idx on public.prospect_activities (prospect_id, created_at desc);
create index prospect_notes_prospect_idx on public.prospect_notes (prospect_id, created_at desc);
create index enrichment_jobs_workspace_idx on public.enrichment_jobs (workspace_id, created_at desc);
create index enrichment_fields_prospect_idx on public.enrichment_field_values (prospect_id, retrieved_at desc);
create index prospect_scores_prospect_idx on public.prospect_scores (prospect_id, created_at desc);
create index prospects_merged_idx on public.prospects (workspace_id) where merged_into_prospect_id is null;

create trigger website_analyses_set_updated_at
before update on public.website_analyses
for each row execute function public.set_updated_at();

create trigger pipeline_stages_set_updated_at
before update on public.pipeline_stages
for each row execute function public.set_updated_at();

create trigger prospect_notes_set_updated_at
before update on public.prospect_notes
for each row execute function public.set_updated_at();

create trigger enrichment_jobs_set_updated_at
before update on public.enrichment_jobs
for each row execute function public.set_updated_at();

create trigger scoring_configs_set_updated_at
before update on public.scoring_configs
for each row execute function public.set_updated_at();

create or replace function public.consume_workspace_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_type text,
  p_reference_id text,
  p_actor uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.credit_accounts%rowtype;
  v_balance integer;
begin
  if p_amount < 0 then
    raise exception 'amount must be non-negative';
  end if;

  select * into v_account
  from public.credit_accounts
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'credit account missing';
  end if;

  if p_amount = 0 then
    return v_account.balance;
  end if;

  if v_account.balance < p_amount then
    raise exception 'insufficient credits';
  end if;

  v_balance := v_account.balance - p_amount;
  update public.credit_accounts set balance = v_balance where id = v_account.id;

  insert into public.credit_transactions (
    workspace_id, credit_account_id, amount, balance_after, reason, reference_type, reference_id, created_by
  ) values (
    p_workspace_id, v_account.id, -p_amount, v_balance, p_reason, p_reference_type, p_reference_id, p_actor
  );

  return v_balance;
end;
$$;

create or replace function public.grant_workspace_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_type text,
  p_reference_id text,
  p_actor uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.credit_accounts%rowtype;
  v_balance integer;
begin
  if p_amount < 0 then
    raise exception 'amount must be non-negative';
  end if;

  select * into v_account
  from public.credit_accounts
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'credit account missing';
  end if;

  if p_amount = 0 then
    return v_account.balance;
  end if;

  v_balance := v_account.balance + p_amount;
  update public.credit_accounts set balance = v_balance where id = v_account.id;

  insert into public.credit_transactions (
    workspace_id, credit_account_id, amount, balance_after, reason, reference_type, reference_id, created_by
  ) values (
    p_workspace_id, v_account.id, p_amount, v_balance, p_reason, p_reference_type, p_reference_id, p_actor
  );

  return v_balance;
end;
$$;

revoke all on function public.consume_workspace_credits(uuid, integer, text, text, text, uuid) from public;
revoke all on function public.grant_workspace_credits(uuid, integer, text, text, text, uuid) from public;
grant execute on function public.consume_workspace_credits(uuid, integer, text, text, text, uuid) to service_role;
grant execute on function public.grant_workspace_credits(uuid, integer, text, text, text, uuid) to service_role;

create or replace function public.ensure_default_pipeline_stages(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'forbidden';
  end if;

  insert into public.pipeline_stages (workspace_id, code, label, position)
  values
    (p_workspace_id, 'NEW', 'New', 1),
    (p_workspace_id, 'QUALIFIED', 'Qualified', 2),
    (p_workspace_id, 'CONTACTED', 'Contacted', 3),
    (p_workspace_id, 'ENGAGED', 'Engaged', 4),
    (p_workspace_id, 'MEETING_BOOKED', 'Meeting booked', 5),
    (p_workspace_id, 'CUSTOMER', 'Customer', 6),
    (p_workspace_id, 'DISQUALIFIED', 'Disqualified', 7)
  on conflict (workspace_id, code) do nothing;
end;
$$;

revoke all on function public.ensure_default_pipeline_stages(uuid) from public;
grant execute on function public.ensure_default_pipeline_stages(uuid) to authenticated;

drop policy discovery_searches_write on public.discovery_searches;
drop policy discovery_results_write on public.discovery_search_results;

alter table public.website_analyses enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.prospect_notes enable row level security;
alter table public.prospect_activities enable row level security;
alter table public.prospect_merges enable row level security;
alter table public.enrichment_jobs enable row level security;
alter table public.enrichment_field_values enable row level security;
alter table public.scoring_configs enable row level security;
alter table public.prospect_scores enable row level security;

create policy website_analyses_select on public.website_analyses
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy pipeline_stages_select on public.pipeline_stages
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy pipeline_stages_write on public.pipeline_stages
for all to authenticated
using (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']))
with check (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']));

create policy prospect_notes_select on public.prospect_notes
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy prospect_notes_write on public.prospect_notes
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy prospect_activities_select on public.prospect_activities
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy prospect_activities_insert on public.prospect_activities
for insert to authenticated
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy prospect_merges_select on public.prospect_merges
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy prospect_merges_insert on public.prospect_merges
for insert to authenticated
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy enrichment_jobs_select on public.enrichment_jobs
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy enrichment_fields_select on public.enrichment_field_values
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy scoring_configs_select on public.scoring_configs
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy scoring_configs_write on public.scoring_configs
for all to authenticated
using (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']))
with check (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']));

create policy prospect_scores_select on public.prospect_scores
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy prospect_scores_insert on public.prospect_scores
for insert to authenticated
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy prospect_scores_update on public.prospect_scores
for update to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));
