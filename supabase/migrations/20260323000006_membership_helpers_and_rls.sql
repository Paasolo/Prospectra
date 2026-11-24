-- Membership helpers and RLS for tenant tables

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(p_workspace_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role::text = any (p_roles)
  );
$$;

create or replace function public.has_workspace_permission(p_workspace_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  member_role text;
begin
  select wm.role::text into member_role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid()
  limit 1;

  if member_role is null then
    return false;
  end if;

  if member_role = 'OWNER' then
    return true;
  end if;

  if p_permission = 'workspace.read' then
    return true;
  end if;

  if p_permission in ('workspace.manage', 'billing.manage', 'members.manage') then
    return member_role in ('ADMIN');
  end if;

  if p_permission in ('prospects.write', 'campaigns.write', 'lists.write') then
    return member_role in ('ADMIN', 'MANAGER', 'MEMBER');
  end if;

  if p_permission in ('prospects.read', 'campaigns.read', 'analytics.read') then
    return member_role in ('ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');
  end if;

  return false;
end;
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid, text[]) from public;
revoke all on function public.has_workspace_permission(uuid, text) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function public.has_workspace_permission(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.workspace_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.usage_records enable row level security;
alter table public.companies enable row level security;
alter table public.prospects enable row level security;
alter table public.prospect_lists enable row level security;
alter table public.prospect_list_members enable row level security;
alter table public.icp_profiles enable row level security;
alter table public.discovery_searches enable row level security;
alter table public.discovery_search_results enable row level security;
alter table public.integrations enable row level security;
alter table public.notifications enable row level security;
alter table public.campaigns enable row level security;
alter table public.email_messages enable row level security;
alter table public.meetings enable row level security;

-- Profiles
create policy profiles_select_self on public.profiles
for select to authenticated
using (id = auth.uid());

create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Workspaces: members can read; creators insert; owners/admins update
create policy workspaces_select_member on public.workspaces
for select to authenticated
using (public.is_workspace_member(id));

create policy workspaces_insert_authenticated on public.workspaces
for insert to authenticated
with check (created_by = auth.uid());

create policy workspaces_update_admin on public.workspaces
for update to authenticated
using (public.has_workspace_role(id, array['OWNER', 'ADMIN']))
with check (public.has_workspace_role(id, array['OWNER', 'ADMIN']));

create policy workspaces_delete_owner on public.workspaces
for delete to authenticated
using (public.has_workspace_role(id, array['OWNER']));

-- Members: avoid recursion by using security definer helpers only
create policy workspace_members_select on public.workspace_members
for select to authenticated
using (public.is_workspace_member(workspace_id) or user_id = auth.uid());

create policy workspace_members_insert_admin on public.workspace_members
for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN'])
  or (
    user_id = auth.uid()
    and role = 'OWNER'
    and not exists (
      select 1 from public.workspace_members existing
      where existing.workspace_id = workspace_members.workspace_id
    )
  )
);

create policy workspace_members_update_admin on public.workspace_members
for update to authenticated
using (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']))
with check (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']));

create policy workspace_members_delete_admin on public.workspace_members
for delete to authenticated
using (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']));

create policy workspace_invitations_member on public.workspace_invitations
for all to authenticated
using (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']))
with check (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']));

create policy workspace_settings_member_select on public.workspace_settings
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy workspace_settings_member_write on public.workspace_settings
for all to authenticated
using (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN', 'MANAGER']))
with check (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN', 'MANAGER']));

create policy audit_logs_select on public.audit_logs
for select to authenticated
using (
  workspace_id is null and actor_user_id = auth.uid()
  or (workspace_id is not null and public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']))
);

create policy audit_logs_insert on public.audit_logs
for insert to authenticated
with check (actor_user_id = auth.uid());

create policy plans_select_all on public.plans
for select to authenticated
using (is_active = true);

create policy subscriptions_member on public.subscriptions
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy credit_accounts_member on public.credit_accounts
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy credit_transactions_member on public.credit_transactions
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy usage_records_member on public.usage_records
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy companies_member_select on public.companies
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy companies_member_write on public.companies
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy prospects_member_select on public.prospects
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy prospects_member_write on public.prospects
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy prospect_lists_member_select on public.prospect_lists
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy prospect_lists_member_write on public.prospect_lists
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'lists.write'))
with check (public.has_workspace_permission(workspace_id, 'lists.write'));

create policy prospect_list_members_select on public.prospect_list_members
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy prospect_list_members_write on public.prospect_list_members
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'lists.write'))
with check (public.has_workspace_permission(workspace_id, 'lists.write'));

create policy icp_profiles_select on public.icp_profiles
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy icp_profiles_write on public.icp_profiles
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy discovery_searches_select on public.discovery_searches
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy discovery_searches_write on public.discovery_searches
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy discovery_results_select on public.discovery_search_results
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.read'));

create policy discovery_results_write on public.discovery_search_results
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'prospects.write'))
with check (public.has_workspace_permission(workspace_id, 'prospects.write'));

create policy integrations_select on public.integrations
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy integrations_write on public.integrations
for all to authenticated
using (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']))
with check (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']));

create policy notifications_own on public.notifications
for all to authenticated
using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy campaigns_select on public.campaigns
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy campaigns_write on public.campaigns
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create policy email_messages_select on public.email_messages
for select to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.read'));

create policy email_messages_write on public.email_messages
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));

create policy meetings_select on public.meetings
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy meetings_write on public.meetings
for all to authenticated
using (public.has_workspace_permission(workspace_id, 'campaigns.write'))
with check (public.has_workspace_permission(workspace_id, 'campaigns.write'));
