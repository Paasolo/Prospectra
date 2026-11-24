-- First-party outbound agent: research and drafts stop before send.
-- Service role writes run progress. Authenticated members read and cannot mark mail sent.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'awaiting_approval', 'partially_approved', 'completed', 'failed')),
  website_url text,
  offer_description text,
  company_name text,
  prospect_cap integer not null default 10 check (prospect_cap between 1 and 25),
  offer_summary text,
  website_analysis_id uuid references public.website_analyses (id) on delete set null,
  competitors jsonb not null default '[]'::jsonb,
  estimated_credits integer not null default 0,
  reserved_credits integer not null default 0,
  consumed_credits integer not null default 0,
  reservation_id uuid,
  discovery_configured boolean not null default false,
  mailbox_connected boolean not null default false,
  error_code text,
  error_detail text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.agent_segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  run_id uuid not null references public.agent_runs (id) on delete cascade,
  position integer not null default 1,
  name text not null,
  who_buys text not null,
  fit_score integer not null check (fit_score between 0 and 100),
  evidence_note text not null check (char_length(trim(evidence_note)) > 0),
  job_titles jsonb not null default '[]'::jsonb,
  industries jsonb not null default '[]'::jsonb,
  geographies jsonb not null default '[]'::jsonb,
  keywords jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'working', 'scaling', 'paused')),
  discovery_state text not null default 'unconfigured'
    check (discovery_state in ('configured', 'unconfigured', 'partial', 'failed')),
  setup_message text,
  prospect_ids uuid[] not null default '{}',
  draft_ids uuid[] not null default '{}',
  list_id uuid references public.prospect_lists (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  icp_profile_id uuid references public.icp_profiles (id) on delete set null,
  sends integer not null default 0 check (sends >= 0),
  positive_replies integer not null default 0 check (positive_replies >= 0),
  credits_spent integer not null default 0 check (credits_spent >= 0),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agent_segments_run_position unique (run_id, position)
);

create index agent_runs_workspace_created_idx
  on public.agent_runs (workspace_id, created_at desc);

create index agent_segments_workspace_run_idx
  on public.agent_segments (workspace_id, run_id);

create trigger agent_runs_set_updated_at
before update on public.agent_runs
for each row execute function public.set_updated_at();

create trigger agent_segments_set_updated_at
before update on public.agent_segments
for each row execute function public.set_updated_at();

create or replace function public.assert_same_workspace(p_table regclass, p_id uuid, p_workspace uuid)
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  found uuid;
  schema_name text;
  table_name text;
begin
  if p_id is null then
    return;
  end if;
  if p_table not in (
    'public.companies'::regclass,
    'public.prospects'::regclass,
    'public.prospect_lists'::regclass,
    'public.icp_profiles'::regclass,
    'public.discovery_searches'::regclass,
    'public.campaigns'::regclass,
    'public.email_templates'::regclass,
    'public.inbox_conversations'::regclass,
    'public.agent_runs'::regclass,
    'public.website_analyses'::regclass
  ) then
    raise exception 'workspace mismatch';
  end if;

  select n.nspname, c.relname
    into schema_name, table_name
  from pg_catalog.pg_class as c
  join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
  where c.oid = p_table;

  execute format('select workspace_id from %I.%I where id = $1', schema_name, table_name)
    into found
    using p_id;

  if found is distinct from p_workspace then
    raise exception 'workspace mismatch';
  end if;
end;
$$;

create or replace function public.enforce_child_workspace()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'prospects' then
    perform public.assert_same_workspace('public.companies', new.company_id, new.workspace_id);
  elsif tg_table_name = 'prospect_list_members' then
    perform public.assert_same_workspace('public.prospect_lists', new.list_id, new.workspace_id);
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
  elsif tg_table_name = 'discovery_searches' then
    perform public.assert_same_workspace('public.icp_profiles', new.icp_profile_id, new.workspace_id);
  elsif tg_table_name = 'discovery_search_results' then
    perform public.assert_same_workspace('public.discovery_searches', new.search_id, new.workspace_id);
    perform public.assert_same_workspace('public.companies', new.company_id, new.workspace_id);
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
  elsif tg_table_name = 'campaign_enrollments' then
    perform public.assert_same_workspace('public.campaigns', new.campaign_id, new.workspace_id);
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
  elsif tg_table_name = 'email_messages' then
    perform public.assert_same_workspace('public.campaigns', new.campaign_id, new.workspace_id);
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
    perform public.assert_same_workspace('public.inbox_conversations', new.conversation_id, new.workspace_id);
  elsif tg_table_name = 'meetings' then
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
    perform public.assert_same_workspace('public.companies', new.company_id, new.workspace_id);
    perform public.assert_same_workspace('public.campaigns', new.campaign_id, new.workspace_id);
    perform public.assert_same_workspace('public.inbox_conversations', new.conversation_id, new.workspace_id);
  elsif tg_table_name = 'prospect_notes' or tg_table_name = 'prospect_activities' then
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
  elsif tg_table_name = 'prospect_merges' then
    perform public.assert_same_workspace('public.prospects', new.surviving_prospect_id, new.workspace_id);
    perform public.assert_same_workspace('public.prospects', new.merged_prospect_id, new.workspace_id);
  elsif tg_table_name = 'prospect_scores' then
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
    perform public.assert_same_workspace('public.icp_profiles', new.icp_profile_id, new.workspace_id);
  elsif tg_table_name = 'email_drafts' then
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
    perform public.assert_same_workspace('public.companies', new.company_id, new.workspace_id);
    perform public.assert_same_workspace('public.icp_profiles', new.icp_id, new.workspace_id);
    perform public.assert_same_workspace('public.email_templates', new.template_id, new.workspace_id);
  elsif tg_table_name = 'campaign_steps' then
    perform public.assert_same_workspace('public.campaigns', new.campaign_id, new.workspace_id);
  elsif tg_table_name = 'inbox_notes' then
    perform public.assert_same_workspace('public.inbox_conversations', new.conversation_id, new.workspace_id);
  elsif tg_table_name = 'inbox_conversations' then
    perform public.assert_same_workspace('public.prospects', new.prospect_id, new.workspace_id);
    perform public.assert_same_workspace('public.companies', new.company_id, new.workspace_id);
    perform public.assert_same_workspace('public.campaigns', new.campaign_id, new.workspace_id);
  elsif tg_table_name = 'campaigns' then
    perform public.assert_same_workspace('public.prospect_lists', new.list_id, new.workspace_id);
  elsif tg_table_name = 'agent_runs' then
    perform public.assert_same_workspace('public.website_analyses', new.website_analysis_id, new.workspace_id);
  elsif tg_table_name = 'agent_segments' then
    perform public.assert_same_workspace('public.agent_runs', new.run_id, new.workspace_id);
    perform public.assert_same_workspace('public.prospect_lists', new.list_id, new.workspace_id);
    perform public.assert_same_workspace('public.campaigns', new.campaign_id, new.workspace_id);
    perform public.assert_same_workspace('public.icp_profiles', new.icp_profile_id, new.workspace_id);
  end if;
  return new;
end;
$$;

drop trigger if exists agent_runs_workspace_match on public.agent_runs;
create trigger agent_runs_workspace_match
before insert or update on public.agent_runs
for each row execute function public.enforce_child_workspace();

drop trigger if exists agent_segments_workspace_match on public.agent_segments;
create trigger agent_segments_workspace_match
before insert or update on public.agent_segments
for each row execute function public.enforce_child_workspace();

alter table public.agent_runs enable row level security;
alter table public.agent_segments enable row level security;

create policy agent_runs_select on public.agent_runs
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy agent_runs_insert on public.agent_runs
for insert to authenticated
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy agent_runs_update on public.agent_runs
for update to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy agent_segments_select on public.agent_segments
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy agent_segments_insert on public.agent_segments
for insert to authenticated
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy agent_segments_update on public.agent_segments
for update to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));
