-- UC_01 Bootstrap: orgs, warehouses, memberships, and bootstrap function.

begin;

create extension if not exists "pgcrypto";

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index orgs_owner_user_id_key on public.orgs (owner_user_id);

create table public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

create unique index org_memberships_org_user_key on public.org_memberships (org_id, user_id);
create index org_memberships_user_id_idx on public.org_memberships (user_id);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  is_default boolean not null default true,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index warehouses_org_default_unique on public.warehouses (org_id) where is_default;
create index warehouses_org_id_idx on public.warehouses (org_id);

alter table public.orgs enable row level security;
alter table public.org_memberships enable row level security;
alter table public.warehouses enable row level security;

create policy orgs_select_own
  on public.orgs
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = orgs.id
        and m.user_id = auth.uid()
    )
  );

create policy orgs_insert_own
  on public.orgs
  for insert
  with check (
    owner_user_id = auth.uid()
    and created_by = auth.uid()
  );

create policy orgs_update_owner
  on public.orgs
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy memberships_select_own
  on public.org_memberships
  for select
  using (user_id = auth.uid());

create policy memberships_insert_self
  on public.org_memberships
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.orgs o
      where o.id = org_memberships.org_id
        and o.owner_user_id = auth.uid()
    )
  );

create policy warehouses_select_org
  on public.warehouses
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = warehouses.org_id
        and m.user_id = auth.uid()
    )
  );

create policy warehouses_insert_org_member
  on public.warehouses
  for insert
  with check (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = warehouses.org_id
        and m.user_id = auth.uid()
    )
    and created_by = auth.uid()
  );

create policy warehouses_update_org_member
  on public.warehouses
  for update
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = warehouses.org_id
        and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = warehouses.org_id
        and m.user_id = auth.uid()
    )
  );

create or replace function public.bootstrap_default_org_and_warehouse()
returns table (org_id uuid, warehouse_id uuid)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
#variable_conflict use_column
declare
  v_org_id uuid;
  v_warehouse_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select m.org_id
    into v_org_id
    from public.org_memberships m
   where m.user_id = auth.uid()
   limit 1;

  if v_org_id is null then
    insert into public.orgs (name, owner_user_id, created_by)
    values ('Default Org', auth.uid(), auth.uid())
    on conflict (owner_user_id)
    do update set owner_user_id = excluded.owner_user_id
    returning id into v_org_id;
  end if;

  insert into public.org_memberships (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner')
  on conflict (org_id, user_id) do nothing;

  select w.id
    into v_warehouse_id
    from public.warehouses w
   where w.org_id = v_org_id
     and w.is_default = true
   limit 1;

  if v_warehouse_id is null then
    insert into public.warehouses (org_id, name, is_default, created_by)
    values (v_org_id, 'Default Warehouse', true, auth.uid())
    on conflict (org_id) where is_default
    do nothing
    returning id into v_warehouse_id;
  end if;

  if v_warehouse_id is null then
    select w.id
      into v_warehouse_id
      from public.warehouses w
     where w.org_id = v_org_id
       and w.is_default = true
     limit 1;
  end if;

  return query select v_org_id, v_warehouse_id;
end;
$$;

commit;
