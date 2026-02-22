-- Fix 1: Tenant validation for optional FK fields (storage_location_id, tag_id)
--         in create_inbound_batch (SECURITY DEFINER bypasses RLS).
-- Fix 2: Race-safe idempotency — replace pre-check SELECT with
--         BEGIN … EXCEPTION WHEN unique_violation THEN … END in both RPCs.
-- Both functions replaced via CREATE OR REPLACE FUNCTION (no schema changes).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. create_inbound_batch  (Fix 1 + Fix 2)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.create_inbound_batch(
  p_item_id             uuid,
  p_quantity            integer,
  p_expiry_date         date    default null,
  p_storage_location_id uuid    default null,
  p_tag_id              uuid    default null,
  p_note                text    default null,
  p_source              text    default 'web',
  p_idempotency_key     text    default null
)
returns table (batch_id uuid, transaction_id uuid, batch_quantity integer)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id             uuid;
  v_org_id              uuid;
  v_warehouse_id        uuid;
  v_role                text;
  v_batch_id            uuid;
  v_txn_id              uuid;
  v_existing_batch_id   uuid;
  v_existing_txn_id     uuid;
  v_existing_qty        integer;
begin
  -- ── auth ──────────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'FORBIDDEN';
  end if;

  select m.org_id, m.role
    into v_org_id, v_role
    from public.org_memberships m
   where m.user_id = v_user_id
   limit 1;

  if v_org_id is null or v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN';
  end if;

  select w.id
    into v_warehouse_id
    from public.warehouses w
   where w.org_id = v_org_id
     and w.is_default = true
   limit 1;

  if v_warehouse_id is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ── validation ────────────────────────────────────────────────────────────
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'QUANTITY_INVALID';
  end if;

  if not exists (
    select 1 from public.items i
    where i.id = p_item_id
      and i.org_id = v_org_id
      and i.is_deleted = false
  ) then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  -- Fix 1: validate optional FK fields are scoped to the caller's org ────────
  if p_storage_location_id is not null then
    if not exists (
      select 1 from public.storage_locations sl
      where sl.id = p_storage_location_id
        and sl.org_id = v_org_id
    ) then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  if p_tag_id is not null then
    if not exists (
      select 1 from public.tags t
      where t.id = p_tag_id
        and t.org_id = v_org_id
    ) then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  -- ── writes (Fix 2: race-safe idempotency via exception handler) ───────────
  if p_idempotency_key is not null then
    begin
      insert into public.batches
        (org_id, warehouse_id, item_id, quantity, expiry_date, storage_location_id, tag_id, created_by)
      values
        (v_org_id, v_warehouse_id, p_item_id, p_quantity, p_expiry_date, p_storage_location_id, p_tag_id, v_user_id)
      returning id into v_batch_id;

      insert into public.transactions
        (org_id, warehouse_id, batch_id, item_id, type, quantity_delta, idempotency_key, note, source, created_by)
      values
        (v_org_id, v_warehouse_id, v_batch_id, p_item_id, 'inbound', p_quantity, p_idempotency_key, p_note, p_source, v_user_id)
      returning id into v_txn_id;

    exception when unique_violation then
      -- Savepoint rolled back automatically; read the pre-existing record.
      select t.batch_id, t.id, b.quantity
        into v_existing_batch_id, v_existing_txn_id, v_existing_qty
        from public.transactions t
        join public.batches b on b.id = t.batch_id
       where t.org_id = v_org_id
         and t.idempotency_key = p_idempotency_key
       limit 1;

      if not found then
        raise exception 'FORBIDDEN';
      end if;

      return query select v_existing_batch_id, v_existing_txn_id, v_existing_qty;
      return;
    end;
  else
    insert into public.batches
      (org_id, warehouse_id, item_id, quantity, expiry_date, storage_location_id, tag_id, created_by)
    values
      (v_org_id, v_warehouse_id, p_item_id, p_quantity, p_expiry_date, p_storage_location_id, p_tag_id, v_user_id)
    returning id into v_batch_id;

    insert into public.transactions
      (org_id, warehouse_id, batch_id, item_id, type, quantity_delta, idempotency_key, note, source, created_by)
    values
      (v_org_id, v_warehouse_id, v_batch_id, p_item_id, 'inbound', p_quantity, p_idempotency_key, p_note, p_source, v_user_id)
    returning id into v_txn_id;
  end if;

  return query select v_batch_id, v_txn_id, p_quantity;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. add_inbound_to_batch  (Fix 2 only — no optional FK params)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.add_inbound_to_batch(
  p_batch_id        uuid,
  p_quantity        integer,
  p_note            text    default null,
  p_source          text    default 'web',
  p_idempotency_key text    default null
)
returns table (batch_id uuid, transaction_id uuid, batch_quantity integer)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id         uuid;
  v_org_id          uuid;
  v_warehouse_id    uuid;
  v_role            text;
  v_batch_item_id   uuid;
  v_txn_id          uuid;
  v_new_quantity    integer;
  v_existing_txn_id uuid;
  v_existing_qty    integer;
begin
  -- ── auth ──────────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'FORBIDDEN';
  end if;

  select m.org_id, m.role
    into v_org_id, v_role
    from public.org_memberships m
   where m.user_id = v_user_id
   limit 1;

  if v_org_id is null or v_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN';
  end if;

  select w.id
    into v_warehouse_id
    from public.warehouses w
   where w.org_id = v_org_id
     and w.is_default = true
   limit 1;

  if v_warehouse_id is null then
    raise exception 'FORBIDDEN';
  end if;

  -- ── validation ────────────────────────────────────────────────────────────
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'QUANTITY_INVALID';
  end if;

  -- ── writes (Fix 2: race-safe idempotency via exception handler) ───────────
  if p_idempotency_key is not null then
    begin
      -- Row lock prevents concurrent quantity updates to the same batch.
      select b.item_id
        into v_batch_item_id
        from public.batches b
       where b.id = p_batch_id
         and b.org_id = v_org_id
       for update;

      if v_batch_item_id is null then
        raise exception 'BATCH_NOT_FOUND';
      end if;

      update public.batches
         set quantity   = quantity + p_quantity,
             updated_at = now()
       where id     = p_batch_id
         and org_id = v_org_id
      returning quantity into v_new_quantity;

      insert into public.transactions
        (org_id, warehouse_id, batch_id, item_id, type, quantity_delta, idempotency_key, note, source, created_by)
      values
        (v_org_id, v_warehouse_id, p_batch_id, v_batch_item_id, 'inbound', p_quantity, p_idempotency_key, p_note, p_source, v_user_id)
      returning id into v_txn_id;

    exception when unique_violation then
      -- Savepoint rolled back automatically (UPDATE + INSERT undone);
      -- read the current state from the first successful write.
      select t.id, b.quantity
        into v_existing_txn_id, v_existing_qty
        from public.transactions t
        join public.batches b on b.id = t.batch_id
       where t.org_id = v_org_id
         and t.idempotency_key = p_idempotency_key
       limit 1;

      if not found then
        raise exception 'FORBIDDEN';
      end if;

      return query select p_batch_id, v_existing_txn_id, v_existing_qty;
      return;
    end;
  else
    -- No idempotency key: lock + verify + write directly.
    select b.item_id
      into v_batch_item_id
      from public.batches b
     where b.id = p_batch_id
       and b.org_id = v_org_id
     for update;

    if v_batch_item_id is null then
      raise exception 'BATCH_NOT_FOUND';
    end if;

    update public.batches
       set quantity   = quantity + p_quantity,
           updated_at = now()
     where id     = p_batch_id
       and org_id = v_org_id
    returning quantity into v_new_quantity;

    insert into public.transactions
      (org_id, warehouse_id, batch_id, item_id, type, quantity_delta, idempotency_key, note, source, created_by)
    values
      (v_org_id, v_warehouse_id, p_batch_id, v_batch_item_id, 'inbound', p_quantity, p_idempotency_key, p_note, p_source, v_user_id)
    returning id into v_txn_id;
  end if;

  return query select p_batch_id, v_txn_id, v_new_quantity;
end;
$$;

commit;
