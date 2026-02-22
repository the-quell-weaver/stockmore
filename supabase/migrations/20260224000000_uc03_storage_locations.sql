begin;

create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index storage_locations_warehouse_name_unique
  on public.storage_locations (warehouse_id, lower(name));

create index storage_locations_org_id_idx on public.storage_locations (org_id);
create index storage_locations_warehouse_id_idx on public.storage_locations (warehouse_id);

create or replace function public.set_storage_locations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger storage_locations_set_updated_at
before update on public.storage_locations
for each row
execute function public.set_storage_locations_updated_at();

alter table public.storage_locations enable row level security;

create policy storage_locations_select_org_member
  on public.storage_locations
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = storage_locations.org_id
        and m.user_id = auth.uid()
    )
  );

create policy storage_locations_insert_owner_editor
  on public.storage_locations
  for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.org_memberships m
      where m.org_id = storage_locations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  );

create policy storage_locations_update_owner_editor
  on public.storage_locations
  for update
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = storage_locations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = storage_locations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  );

commit;
