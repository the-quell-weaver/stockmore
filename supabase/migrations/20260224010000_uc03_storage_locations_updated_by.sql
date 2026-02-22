begin;

alter table public.storage_locations
  add column updated_by uuid references auth.users (id) on delete restrict;

update public.storage_locations
set updated_by = created_by
where updated_by is null;

alter table public.storage_locations
  alter column updated_by set not null;

drop policy if exists storage_locations_insert_owner_editor on public.storage_locations;
create policy storage_locations_insert_owner_editor
  on public.storage_locations
  for insert
  with check (
    created_by = auth.uid()
    and updated_by = auth.uid()
    and exists (
      select 1
      from public.org_memberships m
      where m.org_id = storage_locations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  );

drop policy if exists storage_locations_update_owner_editor on public.storage_locations;
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
    updated_by = auth.uid()
    and exists (
      select 1
      from public.org_memberships m
      where m.org_id = storage_locations.org_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'editor')
    )
  );

commit;
