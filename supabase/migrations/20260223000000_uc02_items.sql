begin;

alter table public.org_memberships
  drop constraint if exists org_memberships_role_check;

alter table public.org_memberships
  add constraint org_memberships_role_check
  check (role in ('owner', 'editor', 'viewer'));

create table public.items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  unit text not null,
  min_stock numeric(12, 3) not null default 0,
  default_tag_id uuid null,
  note text null,
  is_deleted boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_min_stock_non_negative check (min_stock >= 0)
);

create unique index items_org_name_active_unique
  on public.items (org_id, lower(name))
  where is_deleted = false;

create index items_org_id_idx on public.items (org_id);
create index items_org_name_search_idx on public.items (org_id, lower(name));

create or replace function public.set_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at
before update on public.items
for each row
execute function public.set_items_updated_at();

alter table public.items enable row level security;

create policy items_select_org_member
  on public.items
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = items.org_id
        and m.user_id = auth.uid()
    )
  );

create policy items_insert_owner_editor
  on public.items
  for insert
  with check (
    created_by = auth.uid()
    and updated_by = auth.uid()
    and exists (
      select 1
      from public.org_memberships m
      where m.org_id = items.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  );

create policy items_update_owner_editor
  on public.items
  for update
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = items.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  )
  with check (
    updated_by = auth.uid()
    and exists (
      select 1
      from public.org_memberships m
      where m.org_id = items.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  );

commit;
