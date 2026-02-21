-- UC_01 PR#4: finalize RLS coverage for org_memberships updates.

begin;

create policy memberships_update_org_owner
  on public.org_memberships
  for update
  using (
    exists (
      select 1
      from public.orgs o
      where o.id = org_memberships.org_id
        and o.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.orgs o
      where o.id = org_memberships.org_id
        and o.owner_user_id = auth.uid()
    )
  );

commit;
