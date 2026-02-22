begin;

-- P1: Ensure warehouse_id in tag writes belongs to the same org as org_id.
-- The original policies only validated org membership but did not verify that
-- the supplied warehouse_id actually belongs to tags.org_id, allowing a crafted
-- client to write a row that crosses tenant boundaries.
drop policy tags_insert_owner_editor on public.tags;
drop policy tags_update_owner_editor on public.tags;

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
    and exists (
      select 1
      from public.warehouses w
      where w.id = tags.warehouse_id
        and w.org_id = tags.org_id
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
    and exists (
      select 1
      from public.warehouses w
      where w.id = tags.warehouse_id
        and w.org_id = tags.org_id
    )
  );

-- P2: Ensure items.default_tag_id references a tag in the same org.
-- The FK only enforces existence (tags.id), not tenant ownership.  A crafted
-- client could link an item in org A to a tag row from org B if the UUID is
-- known.  A BEFORE trigger with SECURITY DEFINER enforces org-scoped
-- referential integrity at the DB level, independently of RLS context.
create or replace function public.check_item_tag_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.default_tag_id is not null then
    if not exists (
      select 1
      from public.tags t
      where t.id = new.default_tag_id
        and t.org_id = new.org_id
    ) then
      raise exception 'default_tag_id must reference a tag within the same org'
        using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger items_check_tag_org
before insert or update of default_tag_id, org_id
on public.items
for each row
execute function public.check_item_tag_org();

commit;
