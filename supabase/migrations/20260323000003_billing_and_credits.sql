-- Plans, subscriptions, credits, usage

create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'incomplete'
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  annual_price_cents integer not null default 0 check (annual_price_cents >= 0),
  currency text not null default 'USD',
  included_credits integer not null default 0,
  team_member_limit integer,
  campaign_limit integer,
  prospect_limit integer,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null default 'incomplete',
  provider text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscriptions_workspace_unique unique (workspace_id)
);

create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint credit_accounts_workspace_unique unique (workspace_id)
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  credit_account_id uuid not null references public.credit_accounts (id) on delete cascade,
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  reference_type text,
  reference_id text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  metric text not null,
  quantity numeric not null default 0,
  period_start timestamptz not null,
  period_end timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index subscriptions_workspace_id_idx on public.subscriptions (workspace_id);
create index credit_transactions_workspace_id_idx on public.credit_transactions (workspace_id);
create index usage_records_workspace_id_idx on public.usage_records (workspace_id);

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create trigger credit_accounts_set_updated_at
before update on public.credit_accounts
for each row execute function public.set_updated_at();

insert into public.plans (code, name, description, monthly_price_cents, annual_price_cents, included_credits, team_member_limit)
values
  ('free', 'Free', 'Explore Prospectra with limited capacity', 0, 0, 50, 2),
  ('starter', 'Starter', 'For early sales teams', 4900, 47000, 500, 5),
  ('growth', 'Growth', 'For continuous outbound programmes', 14900, 143000, 2500, 15),
  ('business', 'Business', 'For broader team access', 34900, 335000, 8000, 50),
  ('enterprise', 'Enterprise', 'Custom limits and contracts', 0, 0, 0, null);
