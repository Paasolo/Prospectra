-- Integrations, notifications, campaign stubs for dashboard metrics

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null,
  category text not null,
  status text not null default 'unconfigured',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint integrations_workspace_provider_unique unique (workspace_id, provider)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create type public.campaign_status as enum (
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED'
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  status public.campaign_status not null default 'DRAFT',
  created_by uuid references public.profiles (id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid references public.campaigns (id) on delete set null,
  prospect_id uuid references public.prospects (id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  provider_status text,
  subject text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null,
  starts_at timestamptz,
  provider_confirmed boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index integrations_workspace_id_idx on public.integrations (workspace_id);
create index notifications_user_id_idx on public.notifications (user_id, created_at desc);
create index campaigns_workspace_id_idx on public.campaigns (workspace_id);
create index email_messages_workspace_id_idx on public.email_messages (workspace_id);
create index meetings_workspace_id_idx on public.meetings (workspace_id);

create trigger integrations_set_updated_at
before update on public.integrations
for each row execute function public.set_updated_at();

create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.set_updated_at();

create trigger meetings_set_updated_at
before update on public.meetings
for each row execute function public.set_updated_at();
