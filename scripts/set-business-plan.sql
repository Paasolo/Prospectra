-- Set a workspace subscription to Business (manual override, not a payment).
-- Run in Supabase Dashboard → SQL Editor.
--
-- Fill in ONE target below, then run the whole script.

do $$
declare
  -- === edit these ===
  v_email text := 'you@example.com';          -- account email, or leave null
  v_workspace_id uuid := null;               -- or set a workspace uuid
  v_workspace_slug text := null;             -- or set a workspace slug
  v_plan_code text := 'business';            -- free|starter|growth|business|enterprise
  v_billing_interval text := 'month';        -- month|year
  v_grant_credits boolean := true;           -- grant plan included_credits
  -- ==================

  v_plan public.plans%rowtype;
  v_workspace public.workspaces%rowtype;
  v_subscription_id uuid;
  v_period_start timestamptz := timezone('utc', now());
  v_period_end timestamptz;
  v_balance integer;
begin
  if v_email is null and v_workspace_id is null and v_workspace_slug is null then
    raise exception 'Set v_email, v_workspace_id, or v_workspace_slug';
  end if;

  select * into v_plan
  from public.plans
  where code = v_plan_code and is_active = true
  limit 1;

  if not found then
    raise exception 'Plan % not found. Apply billing migrations first.', v_plan_code;
  end if;

  if v_workspace_id is not null then
    select * into v_workspace from public.workspaces where id = v_workspace_id;
  elsif v_workspace_slug is not null then
    select * into v_workspace from public.workspaces where slug = lower(v_workspace_slug);
  else
    select w.* into v_workspace
    from public.profiles p
    join public.workspace_members wm on wm.user_id = p.id
    join public.workspaces w on w.id = wm.workspace_id
    where lower(p.email) = lower(v_email)
    order by case when wm.role = 'OWNER' then 0 else 1 end, wm.created_at
    limit 1;
  end if;

  if not found or v_workspace.id is null then
    raise exception 'Workspace not found for the given target';
  end if;

  if v_billing_interval = 'year' then
    v_period_end := v_period_start + interval '1 year';
  else
    v_period_end := v_period_start + interval '1 month';
  end if;

  insert into public.subscriptions (
    workspace_id,
    plan_id,
    status,
    provider,
    billing_interval,
    currency,
    current_period_start,
    current_period_end,
    cancel_at
  ) values (
    v_workspace.id,
    v_plan.id,
    'active',
    'manual',
    v_billing_interval,
    coalesce(v_plan.currency, 'USD'),
    v_period_start,
    v_period_end,
    null
  )
  on conflict (workspace_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    provider = excluded.provider,
    billing_interval = excluded.billing_interval,
    currency = excluded.currency,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at = null
  returning id into v_subscription_id;

  if v_grant_credits and v_plan.included_credits > 0 then
    v_balance := public.grant_workspace_credits(
      v_workspace.id,
      v_plan.included_credits,
      v_plan_code || '_plan_grant',
      'subscription',
      v_subscription_id::text,
      null
    );
  else
    select balance into v_balance
    from public.credit_accounts
    where workspace_id = v_workspace.id;
  end if;

  raise notice 'Updated workspace % (%) to plan % (subscription %, balance %)',
    v_workspace.slug, v_workspace.id, v_plan.code, v_subscription_id, coalesce(v_balance, 0);
end;
$$;

-- Verify (optional): replace the email / id after running
-- select w.slug, p.code as plan, s.status, s.provider, s.billing_interval, ca.balance
-- from public.workspaces w
-- join public.subscriptions s on s.workspace_id = w.id
-- join public.plans p on p.id = s.plan_id
-- left join public.credit_accounts ca on ca.workspace_id = w.id
-- where w.id = '<workspace-uuid>';
