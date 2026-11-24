-- Identity, workspaces, invitations, settings, audit logs

create type public.workspace_role as enum (
  'OWNER',
  'ADMIN',
  'MANAGER',
  'MEMBER',
  'VIEWER'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  logo_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspaces_slug_unique unique (slug)
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'MEMBER',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_members_unique unique (workspace_id, user_id)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'MEMBER',
  token text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.workspace_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  industry text,
  company_size text,
  website_url text,
  product_description text,
  target_customers text,
  target_markets text[],
  sales_objectives text,
  onboarding_completed_at timestamptz,
  onboarding_step integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);
create index workspace_members_workspace_id_idx on public.workspace_members (workspace_id);
create index workspace_invitations_workspace_id_idx on public.workspace_invitations (workspace_id);
create index workspace_invitations_email_idx on public.workspace_invitations (email);
create index audit_logs_workspace_id_idx on public.audit_logs (workspace_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

create trigger workspace_invitations_set_updated_at
before update on public.workspace_invitations
for each row execute function public.set_updated_at();

create trigger workspace_settings_set_updated_at
before update on public.workspace_settings
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  insert into public.audit_logs (actor_user_id, action, resource_type, resource_id, metadata)
  values (
    new.id,
    'user.registered',
    'profile',
    new.id::text,
    jsonb_build_object('email', new.email)
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
