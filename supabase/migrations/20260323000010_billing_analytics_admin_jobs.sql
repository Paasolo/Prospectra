-- Credit lots, reservations, payments, notifications, admin, and durable jobs.

alter table public.plans
  add column ai_allowance integer,
  add column enrichment_allowance integer,
  add column features jsonb not null default '{}'::jsonb;

alter table public.subscriptions
  add column billing_interval text check (billing_interval in ('month', 'year')),
  add column provider_customer_id text,
  add column currency text;

alter table public.credit_accounts
  add column low_balance_threshold integer not null default 20 check (low_balance_threshold >= 0);

alter table public.credit_transactions
  add column entry_type text not null default 'adjustment'
    check (entry_type in ('grant', 'consume', 'reserve', 'settle', 'release', 'expire', 'refund', 'adjustment')),
  add column idempotency_key text;

create unique index credit_transactions_idempotency_idx
  on public.credit_transactions (workspace_id, idempotency_key)
  where idempotency_key is not null;

create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  original_amount integer not null check (original_amount >= 0),
  remaining integer not null check (remaining >= 0),
  expires_at timestamptz,
  source text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index credit_lots_draw_idx on public.credit_lots (workspace_id, expires_at, created_at);

insert into public.credit_lots (workspace_id, original_amount, remaining, source)
select workspace_id, balance, balance, 'opening_balance'
from public.credit_accounts
where balance > 0;

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  amount integer not null check (amount >= 0),
  settled_amount integer,
  status text not null check (status in ('held', 'settled', 'released')),
  reason text not null,
  reference_type text,
  reference_id text,
  idempotency_key text,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index credit_reservations_idempotency_idx
  on public.credit_reservations (workspace_id, idempotency_key)
  where idempotency_key is not null;

create trigger credit_reservations_set_updated_at
before update on public.credit_reservations
for each row execute function public.set_updated_at();

create or replace function public.reject_credit_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'credit ledger is append-only';
end;
$$;

create trigger credit_transactions_append_only
before update or delete on public.credit_transactions
for each row execute function public.reject_credit_ledger_mutation();

create or replace function public.apply_credit_delta(
  p_workspace_id uuid,
  p_signed_amount integer,
  p_reason text,
  p_reference_type text,
  p_reference_id text,
  p_actor uuid,
  p_entry_type text,
  p_expires_at timestamptz,
  p_idempotency_key text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.credit_accounts%rowtype;
  v_original integer;
  v_balance integer;
  v_lot public.credit_lots%rowtype;
  v_expired integer := 0;
  v_left integer;
  v_take integer;
begin
  if p_idempotency_key is not null and exists (
    select 1 from public.credit_transactions
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key
  ) then
    select balance into v_balance from public.credit_accounts where workspace_id = p_workspace_id;
    return v_balance;
  end if;

  select * into v_account
  from public.credit_accounts
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'credit account missing';
  end if;

  v_original := v_account.balance;
  v_balance := v_account.balance;

  for v_lot in
    select *
    from public.credit_lots
    where workspace_id = p_workspace_id
      and remaining > 0
      and expires_at is not null
      and expires_at <= timezone('utc', now())
    for update
  loop
    v_expired := v_expired + v_lot.remaining;
    update public.credit_lots set remaining = 0 where id = v_lot.id;
  end loop;

  if v_expired > 0 then
    v_balance := v_balance - v_expired;
    update public.credit_accounts set balance = v_balance where id = v_account.id;
    insert into public.credit_transactions (
      workspace_id, credit_account_id, amount, balance_after, reason, reference_type, reference_id, created_by, entry_type
    ) values (
      p_workspace_id, v_account.id, -v_expired, v_balance, 'credit expiry', 'credit_lot', null, p_actor, 'expire'
    );
  end if;

  if p_signed_amount = 0 then
    return v_balance;
  end if;

  if p_signed_amount > 0 then
    insert into public.credit_lots (workspace_id, original_amount, remaining, expires_at, source)
    values (p_workspace_id, p_signed_amount, p_signed_amount, p_expires_at, p_entry_type);
    v_balance := v_balance + p_signed_amount;
  else
    v_left := -p_signed_amount;
    for v_lot in
      select *
      from public.credit_lots
      where workspace_id = p_workspace_id
        and remaining > 0
        and (expires_at is null or expires_at > timezone('utc', now()))
      order by expires_at nulls last, created_at, id
      for update
    loop
      exit when v_left = 0;
      v_take := least(v_lot.remaining, v_left);
      update public.credit_lots set remaining = remaining - v_take where id = v_lot.id;
      v_left := v_left - v_take;
    end loop;
    if v_left > 0 then
      raise exception 'insufficient credits';
    end if;
    v_balance := v_balance + p_signed_amount;
  end if;

  update public.credit_accounts set balance = v_balance where id = v_account.id;
  insert into public.credit_transactions (
    workspace_id, credit_account_id, amount, balance_after, reason, reference_type, reference_id, created_by, entry_type, idempotency_key
  ) values (
    p_workspace_id, v_account.id, p_signed_amount, v_balance, p_reason, p_reference_type, p_reference_id, p_actor, p_entry_type, p_idempotency_key
  );

  if v_original >= v_account.low_balance_threshold and v_balance < v_account.low_balance_threshold then
    insert into public.notifications (workspace_id, user_id, type, title, body)
    select p_workspace_id, member.user_id, 'low_credits', 'Credits are low',
      'The workspace balance crossed the low-credit threshold.'
    from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.role in ('OWNER', 'ADMIN');
  end if;

  return v_balance;
end;
$$;

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
begin
  if p_amount < 0 then
    raise exception 'amount must be non-negative';
  end if;
  return public.apply_credit_delta(p_workspace_id, -p_amount, p_reason, p_reference_type, p_reference_id, p_actor, 'consume', null, null);
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
begin
  if p_amount < 0 then
    raise exception 'amount must be non-negative';
  end if;
  return public.apply_credit_delta(p_workspace_id, p_amount, p_reason, p_reference_type, p_reference_id, p_actor, 'grant', null, null);
end;
$$;

create or replace function public.reserve_workspace_credits(
  p_workspace_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_type text,
  p_reference_id text,
  p_actor uuid,
  p_idempotency_key text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  if p_amount < 0 then
    raise exception 'amount must be non-negative';
  end if;
  if p_idempotency_key is not null then
    select id into v_existing
    from public.credit_reservations
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  begin
    perform public.apply_credit_delta(
      p_workspace_id, -p_amount, p_reason, p_reference_type, p_reference_id, p_actor, 'reserve', null, p_idempotency_key
    );
    insert into public.credit_reservations (
      workspace_id, amount, status, reason, reference_type, reference_id, idempotency_key, expires_at
    ) values (
      p_workspace_id, p_amount, 'held', p_reason, p_reference_type, p_reference_id, p_idempotency_key, p_expires_at
    )
    returning id into v_id;
  exception when unique_violation then
    select id into v_existing
    from public.credit_reservations
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if v_existing is null then
      raise;
    end if;
    return v_existing;
  end;
  return v_id;
end;
$$;

create or replace function public.settle_workspace_credits(
  p_reservation_id uuid,
  p_actual integer,
  p_actor uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.credit_reservations%rowtype;
  v_refund integer;
begin
  if p_actual < 0 then
    raise exception 'amount must be non-negative';
  end if;
  select * into v_row from public.credit_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reservation missing';
  end if;
  if v_row.status = 'settled' then
    if v_row.settled_amount = p_actual then
      return (select balance from public.credit_accounts where workspace_id = v_row.workspace_id);
    end if;
    raise exception 'reservation already settled';
  end if;
  if v_row.status <> 'held' then
    raise exception 'reservation is not held';
  end if;
  if p_actual > v_row.amount then
    raise exception 'settled usage cannot exceed the reservation';
  end if;
  v_refund := v_row.amount - p_actual;
  if v_refund > 0 then
    perform public.apply_credit_delta(
      v_row.workspace_id, v_refund, 'reservation settlement', 'credit_reservation', v_row.id::text, p_actor, 'settle', null, null
    );
  end if;
  update public.credit_reservations
  set status = 'settled', settled_amount = p_actual
  where id = v_row.id;
  return (select balance from public.credit_accounts where workspace_id = v_row.workspace_id);
end;
$$;

-- Terminal job failure and reservation expiry call this. It returns the unused hold.
create or replace function public.release_workspace_credits(
  p_reservation_id uuid,
  p_actor uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.credit_reservations%rowtype;
begin
  select * into v_row from public.credit_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reservation missing';
  end if;
  if v_row.status = 'released' then
    return (select balance from public.credit_accounts where workspace_id = v_row.workspace_id);
  end if;
  if v_row.status <> 'held' then
    raise exception 'reservation is not held';
  end if;
  perform public.apply_credit_delta(
    v_row.workspace_id, v_row.amount, 'reservation release', 'credit_reservation', v_row.id::text, p_actor, 'release', null, null
  );
  update public.credit_reservations set status = 'released', settled_amount = 0 where id = v_row.id;
  return (select balance from public.credit_accounts where workspace_id = v_row.workspace_id);
end;
$$;

create or replace function public.expire_due_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace uuid;
  v_count integer := 0;
begin
  for v_workspace in
    select distinct workspace_id
    from public.credit_lots
    where remaining > 0 and expires_at is not null and expires_at <= timezone('utc', now())
  loop
    perform public.apply_credit_delta(v_workspace, 0, 'credit expiry', 'credit_lot', null, null, 'expire', null, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.release_expired_credit_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id
    from public.credit_reservations
    where status = 'held' and expires_at is not null and expires_at <= timezone('utc', now())
    for update skip locked
  loop
    perform public.release_workspace_credits(v_id, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.apply_credit_delta(uuid, integer, text, text, text, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.reserve_workspace_credits(uuid, integer, text, text, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.settle_workspace_credits(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.release_workspace_credits(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_due_credits() from public, anon, authenticated;
revoke all on function public.release_expired_credit_reservations() from public, anon, authenticated;
grant execute on function public.consume_workspace_credits(uuid, integer, text, text, text, uuid) to service_role;
grant execute on function public.grant_workspace_credits(uuid, integer, text, text, text, uuid) to service_role;
grant execute on function public.reserve_workspace_credits(uuid, integer, text, text, text, uuid, text, timestamptz) to service_role;
grant execute on function public.settle_workspace_credits(uuid, integer, uuid) to service_role;
grant execute on function public.release_workspace_credits(uuid, uuid) to service_role;
grant execute on function public.expire_due_credits() to service_role;
grant execute on function public.release_expired_credit_reservations() to service_role;

update public.plans
set
  campaign_limit = case code when 'free' then 1 when 'starter' then 5 when 'growth' then 25 when 'business' then 100 else null end,
  prospect_limit = case code when 'free' then 100 when 'starter' then 1000 when 'growth' then 10000 when 'business' then 50000 else null end,
  ai_allowance = case code when 'free' then 10 when 'starter' then 100 when 'growth' then 500 when 'business' then 2000 else null end,
  enrichment_allowance = case code when 'free' then 0 when 'starter' then 50 when 'growth' then 250 when 'business' then 1000 else null end,
  features = case code
    when 'free' then '{"analysis":true,"campaigns":false,"enrichment":false,"ai":true}'::jsonb
    when 'enterprise' then '{"analysis":true,"campaigns":true,"enrichment":true,"ai":true,"sso":true}'::jsonb
    else '{"analysis":true,"campaigns":true,"enrichment":true,"ai":true}'::jsonb
  end;

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
  free_plan public.plans%rowtype;
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
  values (new_workspace.id, 0);

  select * into free_plan from public.plans where code = 'free' limit 1;

  if free_plan.id is not null then
    insert into public.subscriptions (workspace_id, plan_id, status, currency, billing_interval)
    values (new_workspace.id, free_plan.id, 'active', free_plan.currency, 'month');
    if free_plan.included_credits > 0 then
      update public.credit_accounts
      set balance = free_plan.included_credits
      where workspace_id = new_workspace.id;
      insert into public.credit_lots (workspace_id, original_amount, remaining, source)
      values (new_workspace.id, free_plan.included_credits, free_plan.included_credits, 'grant');
      insert into public.credit_transactions (
        workspace_id, credit_account_id, amount, balance_after, reason, reference_type, reference_id, created_by, entry_type
      )
      select new_workspace.id, account.id, free_plan.included_credits, free_plan.included_credits,
        'Included plan credits', 'plan', free_plan.id::text, auth.uid(), 'grant'
      from public.credit_accounts as account
      where account.workspace_id = new_workspace.id;
    end if;
  end if;

  insert into public.audit_logs (workspace_id, actor_user_id, action, resource_type, resource_id)
  values (new_workspace.id, auth.uid(), 'workspace.created', 'workspace', new_workspace.id::text);

  return new_workspace;
end;
$$;

create table public.billing_profiles (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  legal_name text,
  billing_email text,
  tax_id text,
  address jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger billing_profiles_set_updated_at
before update on public.billing_profiles
for each row execute function public.set_updated_at();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  provider text not null,
  provider_invoice_id text not null,
  status text not null check (status in ('draft', 'open', 'paid', 'failed', 'void', 'refunded')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null,
  hosted_url text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_invoice_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  provider text not null,
  provider_refund_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null,
  status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_refund_id)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_event_id)
);

create index invoices_workspace_idx on public.invoices (workspace_id, created_at desc);
create index refunds_workspace_idx on public.refunds (workspace_id, created_at desc);
create index payment_events_workspace_idx on public.payment_events (workspace_id, created_at desc);

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  primary key (user_id, workspace_id, type)
);

create or replace function public.protect_notification_contents()
returns trigger
language plpgsql
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'forbidden';
  end if;
  if new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.type is distinct from old.type
    or new.user_id is distinct from old.user_id
    or new.workspace_id is distinct from old.workspace_id
    or new.created_at is distinct from old.created_at then
    raise exception 'forbidden';
  end if;
  return new;
end;
$$;

create trigger notifications_protect_contents
before insert or update on public.notifications
for each row execute function public.protect_notification_contents();

drop policy notifications_own on public.notifications;
create policy notifications_select on public.notifications
for select to authenticated
using (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy notifications_update on public.notifications
for update to authenticated
using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy notifications_delete on public.notifications
for delete to authenticated
using (user_id = auth.uid() and public.is_workspace_member(workspace_id));

alter table public.credit_lots enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.billing_profiles enable row level security;
alter table public.invoices enable row level security;
alter table public.refunds enable row level security;
alter table public.payment_events enable row level security;
alter table public.notification_preferences enable row level security;

create policy credit_lots_select on public.credit_lots
for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy credit_reservations_select on public.credit_reservations
for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy billing_profiles_select on public.billing_profiles
for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy billing_profiles_write on public.billing_profiles
for all to authenticated
using (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']))
with check (public.has_workspace_role(workspace_id, array['OWNER', 'ADMIN']));
create policy invoices_select on public.invoices
for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy refunds_select on public.refunds
for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy payment_events_select on public.payment_events
for select to authenticated
using (workspace_id is not null and public.is_workspace_member(workspace_id));
create policy notification_preferences_own on public.notification_preferences
for all to authenticated
using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.feature_flags (
  key text primary key,
  description text,
  enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.feature_flags (key, description, enabled)
values
  ('billing_checkout', 'Allows provider checkout when a payment secret is configured.', true),
  ('analytics_pdf', 'Allows server-side analytics PDF downloads.', true);

insert into public.platform_settings (key, value)
values ('support_email', '{"email":""}'::jsonb);

alter table public.platform_admins enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.feature_flags enable row level security;
alter table public.platform_settings enable row level security;

create policy platform_admins_self on public.platform_admins
for select to authenticated
using (user_id = auth.uid());
create policy feature_flags_read on public.feature_flags
for select to authenticated
using (true);

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  job_type text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  run_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  locked_by text,
  heartbeat_at timestamptz,
  last_error text,
  error_category text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index background_jobs_idempotency_idx
  on public.background_jobs (idempotency_key)
  where idempotency_key is not null;
create index background_jobs_claim_idx on public.background_jobs (status, run_at);

create trigger background_jobs_set_updated_at
before update on public.background_jobs
for each row execute function public.set_updated_at();

alter table public.background_jobs enable row level security;

create table public.worker_heartbeats (
  worker_id text primary key,
  seen_at timestamptz not null,
  queue_depth integer not null default 0,
  last_error text
);

alter table public.worker_heartbeats enable row level security;

create or replace function public.enqueue_background_job(
  p_workspace_id uuid,
  p_job_type text,
  p_payload jsonb,
  p_idempotency_key text,
  p_run_at timestamptz,
  p_max_attempts integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  if p_idempotency_key is not null then
    select id into v_existing from public.background_jobs where idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;
  insert into public.background_jobs (workspace_id, job_type, payload, idempotency_key, run_at, max_attempts)
  values (p_workspace_id, p_job_type, coalesce(p_payload, '{}'::jsonb), p_idempotency_key, coalesce(p_run_at, timezone('utc', now())), greatest(p_max_attempts, 1))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  select id into v_existing from public.background_jobs where idempotency_key = p_idempotency_key;
  return v_existing;
end;
$$;

create or replace function public.claim_background_jobs(p_worker text, p_limit integer)
returns setof public.background_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.background_jobs
  set status = 'dead_letter',
      last_error = coalesce(last_error, 'heartbeat lost after the maximum attempts'),
      error_category = coalesce(error_category, 'temporary'),
      updated_at = timezone('utc', now())
  where status = 'running'
    and coalesce(heartbeat_at, locked_at, created_at) < timezone('utc', now()) - interval '2 minutes'
    and attempts >= max_attempts;

  return query
  with claimed as (
    select id, status, attempts
    from public.background_jobs
    where (
      status = 'pending' and run_at <= timezone('utc', now()) and attempts < max_attempts
    ) or (
      status = 'running'
      and coalesce(heartbeat_at, locked_at, created_at) < timezone('utc', now()) - interval '2 minutes'
      and attempts < max_attempts
    )
    order by run_at
    limit greatest(1, least(p_limit, 25))
    for update skip locked
  )
  update public.background_jobs as job
  set status = 'running',
      attempts = case when claimed.status = 'running' then job.attempts + 1 else job.attempts end,
      locked_at = timezone('utc', now()),
      locked_by = p_worker,
      heartbeat_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  from claimed
  where job.id = claimed.id
  returning job.*;
end;
$$;

revoke all on function public.enqueue_background_job(uuid, text, jsonb, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.claim_background_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_background_job(uuid, text, jsonb, text, timestamptz, integer) to service_role;
grant execute on function public.claim_background_jobs(text, integer) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_rel as rel
       join pg_publication as publication on publication.oid = rel.prpubid
       join pg_class as relation on relation.oid = rel.prrelid
       where publication.pubname = 'supabase_realtime' and relation.relname = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
