-- Atomic workspace bootstrap for onboarding

create or replace function public.create_workspace_with_owner(
  p_name text,
  p_slug text
)
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace public.workspaces;
  free_plan_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning * into new_workspace;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace.id, auth.uid(), 'OWNER');

  insert into public.workspace_settings (workspace_id)
  values (new_workspace.id);

  insert into public.credit_accounts (workspace_id, balance)
  values (new_workspace.id, 50);

  select id into free_plan_id from public.plans where code = 'free' limit 1;

  if free_plan_id is not null then
    insert into public.subscriptions (workspace_id, plan_id, status)
    values (new_workspace.id, free_plan_id, 'active');
  end if;

  insert into public.audit_logs (workspace_id, actor_user_id, action, resource_type, resource_id)
  values (new_workspace.id, auth.uid(), 'workspace.created', 'workspace', new_workspace.id::text);

  return new_workspace;
end;
$$;

revoke all on function public.create_workspace_with_owner(text, text) from public;
grant execute on function public.create_workspace_with_owner(text, text) to authenticated;
