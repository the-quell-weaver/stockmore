begin;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tags_warehouse_name_unique
  on public.tags (warehouse_id, lower(name));

create index tags_org_id_idx on public.tags (org_id);
create index tags_warehouse_id_idx on public.tags (warehouse_id);

create or replace function public.set_tags_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tags_set_updated_at
before update on public.tags
for each row
execute function public.set_tags_updated_at();

alter table public.tags enable row level security;

create policy tags_select_org_member
  on public.tags
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = tags.org_id
        and m.user_id = auth.uid()
    )
  );

create policy tags_insert_owner_editor
  on public.tags
  for insert
  with check (
    created_by = auth.uid()
    and updated_by = auth.uid()
    and exists (
      select 1
      from public.org_memberships m
      where m.org_id = tags.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  );

create policy tags_update_owner_editor
  on public.tags
  for update
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = tags.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1
      from public.org_memberships m
      where m.org_id = tags.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  );

-- Add FK from items.default_tag_id → tags.id
alter table public.items
  add constraint items_default_tag_id_fk
  foreign key (default_tag_id) references public.tags (id) on delete set null;

commit;
