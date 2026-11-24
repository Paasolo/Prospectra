-- Assistant, email, campaigns, inbox, and calendar.

alter table public.campaigns
  add column description text,
  add column objective text,
  add column list_id uuid references public.prospect_lists (id) on delete set null,
  add column sending_account_id uuid,
  add column timezone text not null default 'UTC',
  add column daily_limit integer not null default 50,
  add column send_window_start_minutes integer not null default 540,
  add column send_window_end_minutes integer not null default 1020,
  add column send_days smallint[] not null default '{1,2,3,4,5}',
  add column scheduled_for timestamptz,
  add column exclusion_rules jsonb not null default '{}'::jsonb,
  add column audience_ids uuid[] not null default '{}',
  add column stop_on_reply boolean not null default true,
  add column stop_on_unsubscribe boolean not null default true,
  add column stop_on_bounce boolean not null default true,
  add column stop_on_complaint boolean not null default true,
  add column duplicated_from uuid;

alter table public.email_messages
  add column body text,
  add column sending_account_id uuid,
  add column recipient text,
  add column provider text,
  add column provider_message_id text,
  add column provider_thread_id text,
  add column delivery_state text not null default 'queued',
  add column attempted_at timestamptz,
  add column provider_response jsonb not null default '{}'::jsonb,
  add column conversation_id uuid;

alter table public.email_messages
  drop constraint if exists email_messages_delivery_state_check;

alter table public.email_messages
  add constraint email_messages_delivery_state_check
  check (delivery_state in ('queued', 'attempted', 'accepted', 'delivered', 'bounced', 'failed'));

create unique index email_messages_provider_message_idx
  on public.email_messages (workspace_id, provider, provider_message_id)
  where provider_message_id is not null;

alter table public.meetings
  add column ends_at timestamptz,
  add column timezone text not null default 'UTC',
  add column description text,
  add column location text,
  add column attendees jsonb not null default '[]'::jsonb,
  add column prospect_id uuid references public.prospects (id) on delete set null,
  add column company_id uuid references public.companies (id) on delete set null,
  add column conversation_id uuid,
  add column campaign_id uuid references public.campaigns (id) on delete set null,
  add column provider text,
  add column provider_event_id text,
  add column status text not null default 'draft',
  add column provider_error text,
  add column connected_account_id uuid;

alter table public.meetings
  drop constraint if exists meetings_status_check;

alter table public.meetings
  add constraint meetings_status_check
  check (status in ('draft', 'pending', 'confirmed', 'cancelled'));

alter table public.meetings
  drop constraint if exists meetings_confirmation_check;

alter table public.meetings
  add constraint meetings_confirmation_check
  check (provider_confirmed = false or (provider_event_id is not null and status = 'confirmed'));

create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('email', 'calendar')),
  provider text not null check (provider in ('gmail', 'microsoft', 'resend')),
  email_address text,
  sending_identity text,
  status text not null default 'unconfigured' check (status in ('unconfigured', 'connected', 'disconnected', 'error')),
  daily_limit integer not null default 50 check (daily_limit between 1 and 500),
  health jsonb not null default '{}'::jsonb,
  last_error text,
  token_expires_at timestamptz,
  selected_calendar_id text,
  timezone text not null default 'UTC',
  working_start_minutes integer not null default 540,
  working_end_minutes integer not null default 1020,
  working_days smallint[] not null default '{1,2,3,4,5}',
  buffer_minutes integer not null default 15,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.campaigns
  add constraint campaigns_sending_account_fk
  foreign key (sending_account_id) references public.connected_accounts (id) on delete set null;

alter table public.email_messages
  add constraint email_messages_sending_account_fk
  foreign key (sending_account_id) references public.connected_accounts (id) on delete set null;

alter table public.meetings
  add constraint meetings_connected_account_fk
  foreign key (connected_account_id) references public.connected_accounts (id) on delete set null;

create table public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid not null references public.connected_accounts (id) on delete cascade,
  ciphertext text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint integration_secrets_account_unique unique (account_id)
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null default 'New conversation',
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  structured jsonb,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  error_code text,
  error_detail text,
  model text,
  usage jsonb,
  request_key text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_cost_usd numeric,
  status text not null,
  request_key text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  category text not null default 'general',
  subject text not null,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  duplicated_from uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  prospect_id uuid references public.prospects (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  icp_id uuid references public.icp_profiles (id) on delete set null,
  template_id uuid references public.email_templates (id) on delete set null,
  email_type text not null,
  tone text,
  length text,
  call_to_action text,
  instructions text,
  subject text not null default '',
  body text not null default '',
  explanation text,
  variables jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  model text,
  usage jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  position integer not null,
  subject text not null,
  body text not null,
  delay_days integer not null default 0,
  branch_condition text not null default 'always' check (branch_condition in ('always', 'no_reply')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint campaign_steps_position_unique unique (campaign_id, position)
);

create table public.campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'stopped', 'completed')),
  stop_reason text,
  current_step integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint campaign_enrollments_unique unique (campaign_id, prospect_id)
);

create table public.outreach_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  enrollment_id uuid not null references public.campaign_enrollments (id) on delete cascade,
  step_position integer not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'dead_letter', 'needs_reconciliation')),
  run_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  locked_by text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  provider_message_id text,
  reconcile boolean not null default false,
  idempotency_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint outreach_jobs_idempotency_unique unique (idempotency_key)
);

create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint suppressions_email_unique unique (workspace_id, email)
);

create table public.inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  prospect_id uuid references public.prospects (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  subject text,
  provider text,
  provider_thread_id text,
  assigned_to uuid references public.profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'archived')),
  unread boolean not null default true,
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.inbox_conversations
  add constraint inbox_provider_thread_unique unique (workspace_id, provider, provider_thread_id);

alter table public.email_messages
  add constraint email_messages_conversation_fk
  foreign key (conversation_id) references public.inbox_conversations (id) on delete set null;

alter table public.meetings
  add constraint meetings_conversation_fk
  foreign key (conversation_id) references public.inbox_conversations (id) on delete set null;

create table public.inbox_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null references public.inbox_conversations (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index ai_conversations_workspace_idx on public.ai_conversations (workspace_id, updated_at desc);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index ai_usage_log_workspace_idx on public.ai_usage_log (workspace_id, created_at desc);
create index connected_accounts_workspace_idx on public.connected_accounts (workspace_id, kind);
create index outreach_jobs_due_idx on public.outreach_jobs (status, run_at);
create index inbox_conversations_workspace_idx on public.inbox_conversations (workspace_id, last_message_at desc);

create trigger connected_accounts_set_updated_at
before update on public.connected_accounts
for each row execute function public.set_updated_at();

create trigger ai_conversations_set_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

create trigger email_templates_set_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

create trigger email_drafts_set_updated_at
before update on public.email_drafts
for each row execute function public.set_updated_at();

create trigger campaign_steps_set_updated_at
before update on public.campaign_steps
for each row execute function public.set_updated_at();

create trigger campaign_enrollments_set_updated_at
before update on public.campaign_enrollments
for each row execute function public.set_updated_at();

create trigger outreach_jobs_set_updated_at
before update on public.outreach_jobs
for each row execute function public.set_updated_at();

create trigger inbox_conversations_set_updated_at
before update on public.inbox_conversations
for each row execute function public.set_updated_at();

alter table public.connected_accounts enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage_log enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_drafts enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.campaign_enrollments enable row level security;
alter table public.outreach_jobs enable row level security;
alter table public.suppressions enable row level security;
alter table public.inbox_conversations enable row level security;
alter table public.inbox_notes enable row level security;

drop policy if exists email_messages_write on public.email_messages;
drop policy if exists meetings_write on public.meetings;

create policy meetings_insert_draft on public.meetings
for insert to authenticated
with check (
  public.has_workspace_permission(workspace_id, 'campaigns.write')
  and provider_confirmed = false
  and provider_event_id is null
  and status = 'draft'
);

create policy connected_accounts_select on public.connected_accounts
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy connected_accounts_insert on public.connected_accounts
for insert to authenticated
with check (
  public.has_workspace_permission(workspace_id, 'campaigns.write')
  and status = 'unconfigured'
);

create policy connected_accounts_update on public.connected_accounts
for update to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (
  public.has_workspace_permission(workspace_id, 'campaigns.write')
  and status in ('unconfigured', 'disconnected')
);

create policy ai_conversations_select on public.ai_conversations
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy ai_conversations_write on public.ai_conversations
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create policy ai_messages_select on public.ai_messages
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy ai_usage_select on public.ai_usage_log
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy email_templates_all on public.email_templates
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create policy email_templates_select on public.email_templates
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy email_drafts_all on public.email_drafts
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create policy email_drafts_select on public.email_drafts
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy campaign_steps_all on public.campaign_steps
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create policy campaign_steps_select on public.campaign_steps
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy campaign_enrollments_select on public.campaign_enrollments
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy outreach_jobs_select on public.outreach_jobs
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy suppressions_all on public.suppressions
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create policy suppressions_select on public.suppressions
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy inbox_conversations_select on public.inbox_conversations
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy inbox_conversations_update on public.inbox_conversations
for update to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create policy inbox_notes_select on public.inbox_notes
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy inbox_notes_insert on public.inbox_notes
for insert to authenticated
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create or replace function public.claim_outreach_jobs(p_worker text, p_limit integer)
returns setof public.outreach_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select id
    from public.outreach_jobs
    where status in ('pending', 'needs_reconciliation')
      and run_at <= timezone('utc', now())
      and (locked_at is null or locked_at < timezone('utc', now()) - interval '5 minutes')
    order by run_at
    limit greatest(1, least(p_limit, 25))
    for update skip locked
  )
  update public.outreach_jobs as job
  set status = 'running',
      locked_at = timezone('utc', now()),
      locked_by = p_worker,
      updated_at = timezone('utc', now())
  from claimed
  where job.id = claimed.id
  returning job.*;
end;
$$;

revoke all on function public.claim_outreach_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_outreach_jobs(text, integer) to service_role;
