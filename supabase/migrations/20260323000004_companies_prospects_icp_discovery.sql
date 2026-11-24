-- Companies, prospects, ICPs, discovery

create type public.prospect_stage as enum (
  'NEW',
  'QUALIFIED',
  'CONTACTED',
  'ENGAGED',
  'MEETING_BOOKED',
  'CUSTOMER',
  'DISQUALIFIED'
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  domain text,
  website_url text,
  industry text,
  employee_count integer,
  normalized_domain text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint companies_workspace_domain_unique unique (workspace_id, normalized_domain)
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  full_name text,
  email text,
  job_title text,
  stage public.prospect_stage not null default 'NEW',
  normalized_email text,
  owner_user_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint prospects_workspace_email_unique unique (workspace_id, normalized_email)
);

create table public.prospect_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.prospect_list_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  list_id uuid not null references public.prospect_lists (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint prospect_list_members_unique unique (list_id, prospect_id)
);

create table public.icp_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  criteria jsonb not null default '{}'::jsonb,
  quality_score integer check (quality_score is null or (quality_score >= 0 and quality_score <= 100)),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.discovery_searches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  icp_profile_id uuid references public.icp_profiles (id) on delete set null,
  query jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.discovery_search_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  search_id uuid not null references public.discovery_searches (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  prospect_id uuid references public.prospects (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  score numeric,
  created_at timestamptz not null default timezone('utc', now())
);

create index companies_workspace_id_idx on public.companies (workspace_id);
create index prospects_workspace_id_idx on public.prospects (workspace_id);
create index prospects_stage_idx on public.prospects (workspace_id, stage);
create index prospect_lists_workspace_id_idx on public.prospect_lists (workspace_id);
create index icp_profiles_workspace_id_idx on public.icp_profiles (workspace_id);
create index discovery_searches_workspace_id_idx on public.discovery_searches (workspace_id);
create index discovery_search_results_search_id_idx on public.discovery_search_results (search_id);

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create trigger prospects_set_updated_at
before update on public.prospects
for each row execute function public.set_updated_at();

create trigger prospect_lists_set_updated_at
before update on public.prospect_lists
for each row execute function public.set_updated_at();

create trigger icp_profiles_set_updated_at
before update on public.icp_profiles
for each row execute function public.set_updated_at();

create trigger discovery_searches_set_updated_at
before update on public.discovery_searches
for each row execute function public.set_updated_at();
