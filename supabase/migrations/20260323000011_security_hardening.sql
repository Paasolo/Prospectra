-- Phase 19: close workspace write gaps found in review.
-- Workspace creation stays on create_workspace_with_owner (security definer).
-- Credit and job functions stay service-role only, including consume and grant.

drop policy if exists workspaces_insert_authenticated on public.workspaces;

drop policy if exists workspace_members_insert_admin on public.workspace_members;
create policy workspace_members_insert_admin on public.workspace_members
for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']));

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
for insert to authenticated
with check (
  actor_user_id = auth.uid()
  and (
    workspace_id is null
    or public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN'])
  )
);

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
    'public.inbox_conversations'::regclass
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
  end if;
  return new;
end;
$$;

drop trigger if exists prospects_workspace_match on public.prospects;
create trigger prospects_workspace_match
before insert or update on public.prospects
for each row execute function public.enforce_child_workspace();

drop trigger if exists prospect_list_members_workspace_match on public.prospect_list_members;
create trigger prospect_list_members_workspace_match
before insert or update on public.prospect_list_members
for each row execute function public.enforce_child_workspace();

drop trigger if exists discovery_searches_workspace_match on public.discovery_searches;
create trigger discovery_searches_workspace_match
before insert or update on public.discovery_searches
for each row execute function public.enforce_child_workspace();

drop trigger if exists discovery_search_results_workspace_match on public.discovery_search_results;
create trigger discovery_search_results_workspace_match
before insert or update on public.discovery_search_results
for each row execute function public.enforce_child_workspace();

drop trigger if exists campaign_enrollments_workspace_match on public.campaign_enrollments;
create trigger campaign_enrollments_workspace_match
before insert or update on public.campaign_enrollments
for each row execute function public.enforce_child_workspace();

drop trigger if exists email_messages_workspace_match on public.email_messages;
create trigger email_messages_workspace_match
before insert or update on public.email_messages
for each row execute function public.enforce_child_workspace();

drop trigger if exists meetings_workspace_match on public.meetings;
create trigger meetings_workspace_match
before insert or update on public.meetings
for each row execute function public.enforce_child_workspace();

drop trigger if exists prospect_notes_workspace_match on public.prospect_notes;
create trigger prospect_notes_workspace_match
before insert or update on public.prospect_notes
for each row execute function public.enforce_child_workspace();

drop trigger if exists prospect_activities_workspace_match on public.prospect_activities;
create trigger prospect_activities_workspace_match
before insert or update on public.prospect_activities
for each row execute function public.enforce_child_workspace();

drop trigger if exists prospect_merges_workspace_match on public.prospect_merges;
create trigger prospect_merges_workspace_match
before insert or update on public.prospect_merges
for each row execute function public.enforce_child_workspace();

drop trigger if exists prospect_scores_workspace_match on public.prospect_scores;
create trigger prospect_scores_workspace_match
before insert or update on public.prospect_scores
for each row execute function public.enforce_child_workspace();

drop trigger if exists email_drafts_workspace_match on public.email_drafts;
create trigger email_drafts_workspace_match
before insert or update on public.email_drafts
for each row execute function public.enforce_child_workspace();

drop trigger if exists campaign_steps_workspace_match on public.campaign_steps;
create trigger campaign_steps_workspace_match
before insert or update on public.campaign_steps
for each row execute function public.enforce_child_workspace();

drop trigger if exists inbox_notes_workspace_match on public.inbox_notes;
create trigger inbox_notes_workspace_match
before insert or update on public.inbox_notes
for each row execute function public.enforce_child_workspace();

drop trigger if exists inbox_conversations_workspace_match on public.inbox_conversations;
create trigger inbox_conversations_workspace_match
before insert or update on public.inbox_conversations
for each row execute function public.enforce_child_workspace();

drop trigger if exists campaigns_workspace_match on public.campaigns;
create trigger campaigns_workspace_match
before insert or update on public.campaigns
for each row execute function public.enforce_child_workspace();

create or replace function public.reject_authenticated_write()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'forbidden';
  end if;
  return new;
end;
$$;

drop trigger if exists email_messages_service_only on public.email_messages;
create trigger email_messages_service_only
before insert or update or delete on public.email_messages
for each row execute function public.reject_authenticated_write();

drop trigger if exists subscriptions_service_only on public.subscriptions;
create trigger subscriptions_service_only
before insert or update or delete on public.subscriptions
for each row execute function public.reject_authenticated_write();

drop trigger if exists credit_accounts_service_only on public.credit_accounts;
create trigger credit_accounts_service_only
before insert or update or delete on public.credit_accounts
for each row execute function public.reject_authenticated_write();

create or replace function public.protect_meeting_confirmation()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.provider_confirmed
    or new.provider_event_id is not null
    or new.status = 'confirmed'
  ) then
    raise exception 'forbidden';
  end if;
  return new;
end;
$$;

drop trigger if exists meetings_confirmation_guard on public.meetings;
create trigger meetings_confirmation_guard
before insert or update on public.meetings
for each row execute function public.protect_meeting_confirmation();

revoke all on function public.consume_workspace_credits(uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.grant_workspace_credits(uuid, integer, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.apply_credit_delta(uuid, integer, text, text, text, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.reserve_workspace_credits(uuid, integer, text, text, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.settle_workspace_credits(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.release_workspace_credits(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_due_credits() from public, anon, authenticated;
revoke all on function public.release_expired_credit_reservations() from public, anon, authenticated;
revoke all on function public.enqueue_background_job(uuid, text, jsonb, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_background_jobs(text, integer) from public, anon, authenticated;

grant execute on function public.consume_workspace_credits(uuid, integer, text, text, text, uuid) to service_role;
grant execute on function public.grant_workspace_credits(uuid, integer, text, text, text, uuid) to service_role;

create index if not exists prospects_workspace_created_idx on public.prospects (workspace_id, created_at desc);
create index if not exists email_messages_workspace_created_idx on public.email_messages (workspace_id, created_at desc);
create index if not exists meetings_workspace_created_idx on public.meetings (workspace_id, created_at desc);
create index if not exists credit_transactions_workspace_created_idx on public.credit_transactions (workspace_id, created_at desc);
create index if not exists invoices_workspace_created_idx on public.invoices (workspace_id, created_at desc);
create index if not exists background_jobs_status_run_idx on public.background_jobs (status, run_at);
