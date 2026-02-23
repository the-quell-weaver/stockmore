-- UC_06: Upgrade quantity columns from integer to numeric to support decimal consumption.
-- Also updates existing inbound RPC return types + internal variables to numeric
-- so that batch_quantity is not truncated after decimal consumption operations.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Column type changes
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.batches
  alter column quantity type numeric using quantity::numeric;

alter table public.transactions
  alter column quantity_delta type numeric using quantity_delta::numeric;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Re-create create_inbound_batch with numeric return type
--    (logic unchanged; only internal variable + return type updated)
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
returns table (batch_id uuid, transaction_id uuid, batch_quantity numeric)
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
  v_existing_qty        numeric;
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

  -- ── idempotency ───────────────────────────────────────────────────────────
  if p_idempotency_key is not null then
    select t.batch_id, t.id, b.quantity
      into v_existing_batch_id, v_existing_txn_id, v_existing_qty
      from public.transactions t
      join public.batches b on b.id = t.batch_id
     where t.org_id = v_org_id
       and t.idempotency_key = p_idempotency_key
     limit 1;

    if found then
      return query select v_existing_batch_id, v_existing_txn_id, v_existing_qty;
      return;
    end if;
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

  -- ── writes ────────────────────────────────────────────────────────────────
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

  return query select v_batch_id, v_txn_id, p_quantity::numeric;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Re-create add_inbound_to_batch with numeric return type
--    (logic unchanged; only internal variables + return type updated)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.add_inbound_to_batch(
  p_batch_id        uuid,
  p_quantity        integer,
  p_note            text    default null,
  p_source          text    default 'web',
  p_idempotency_key text    default null
)
returns table (batch_id uuid, transaction_id uuid, batch_quantity numeric)
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
  v_new_quantity    numeric;
  v_existing_txn_id uuid;
  v_existing_qty    numeric;
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

  -- ── idempotency ───────────────────────────────────────────────────────────
  if p_idempotency_key is not null then
    select t.id, b.quantity
      into v_existing_txn_id, v_existing_qty
      from public.transactions t
      join public.batches b on b.id = t.batch_id
     where t.org_id = v_org_id
       and t.idempotency_key = p_idempotency_key
     limit 1;

    if found then
      return query select p_batch_id, v_existing_txn_id, v_existing_qty;
      return;
    end if;
  end if;

  -- ── validation ────────────────────────────────────────────────────────────
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'QUANTITY_INVALID';
  end if;

  -- ── lock + verify batch ownership ─────────────────────────────────────────
  select b.item_id
    into v_batch_item_id
    from public.batches b
   where b.id = p_batch_id
     and b.org_id = v_org_id
   for update;

  if v_batch_item_id is null then
    raise exception 'BATCH_NOT_FOUND';
  end if;

  -- ── writes ────────────────────────────────────────────────────────────────
  update public.batches
     set quantity   = quantity + p_quantity,
         updated_at = now()
   where id      = p_batch_id
     and org_id  = v_org_id
  returning quantity into v_new_quantity;

  insert into public.transactions
    (org_id, warehouse_id, batch_id, item_id, type, quantity_delta, idempotency_key, note, source, created_by)
  values
    (v_org_id, v_warehouse_id, p_batch_id, v_batch_item_id, 'inbound', p_quantity, p_idempotency_key, p_note, p_source, v_user_id)
  returning id into v_txn_id;

  return query select p_batch_id, v_txn_id, v_new_quantity;
end;
$$;

commit;
