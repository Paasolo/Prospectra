-- Destructive reset: wipe all public app data, keep public.plans rows.
-- Run in Supabase Dashboard → SQL Editor (service role / postgres).
--
-- Does NOT delete auth.users by default. Uncomment the auth wipe at the bottom
-- if you also want every login account removed.

begin;

do $$
declare
  r record;
begin
  -- Disable triggers that might block bulk clears (RLS does not apply to table owner).
  for r in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> 'plans'
    order by c.relname
  loop
    execute format(
      'truncate table public.%I restart identity cascade',
      r.tablename
    );
  end loop;
end;
$$;

-- Confirm plans survived
do $$
declare
  plan_count integer;
begin
  select count(*) into plan_count from public.plans;
  if plan_count = 0 then
    raise exception 'plans table is empty after truncate — aborting';
  end if;
  raise notice 'Kept % plan row(s). All other public tables truncated.', plan_count;
end;
$$;

commit;

-- Optional: also remove every Auth user (profiles already truncated above).
-- Uncomment to wipe logins too:
--
-- begin;
-- delete from auth.users;
-- commit;
