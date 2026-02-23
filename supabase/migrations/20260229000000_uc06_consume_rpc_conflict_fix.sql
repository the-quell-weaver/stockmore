-- UC_06 fix: correct the idempotency-conflict error code in consume_from_batch.
--
-- Bug: in the unique_violation handler the original code raised 'FORBIDDEN'
-- when the conflicting idempotency row could not be found (extreme edge case).
-- This is inconsistent with adjust_batch_quantity (20260228000001) which
-- correctly raises 'CONFLICT' for the same scenario.  'FORBIDDEN' is
-- misleading: the failure is not an authorisation issue but a data consistency
-- anomaly, so CONFLICT is the correct code.
--
-- Fix: replace `raise exception 'FORBIDDEN'` with `raise exception 'CONFLICT'`
-- in the unique_violation handler.
--
-- Must DROP before CREATE because we want to be explicit (CREATE OR REPLACE
-- would work here since the signature/return type is unchanged).

begin;

drop function if exists public.consume_from_batch(uuid, numeric, text, text, text);

create or replace function public.consume_from_batch(
  p_batch_id        uuid,
  p_quantity        numeric,
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
  v_batch_quantity  numeric;
  v_txn_id          uuid;
  v_new_quantity    numeric;
  v_existing_batch_id uuid;   -- capture persisted batch_id on conflict
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

  -- ── validation ────────────────────────────────────────────────────────────
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'QUANTITY_INVALID';
  end if;

  -- ── writes (race-safe idempotency via exception handler) ──────────────────
  if p_idempotency_key is not null then
    begin
      -- SELECT FOR UPDATE: lock the batch row to prevent concurrent over-deduction.
      select b.item_id, b.quantity
        into v_batch_item_id, v_batch_quantity
        from public.batches b
       where b.id = p_batch_id
         and b.org_id = v_org_id
       for update;

      if v_batch_item_id is null then
        raise exception 'BATCH_NOT_FOUND';
      end if;

      -- Stock sufficiency check (raises INSUFFICIENT_STOCK, not caught here).
      if v_batch_quantity < p_quantity then
        raise exception 'INSUFFICIENT_STOCK';
      end if;

      update public.batches
         set quantity   = quantity - p_quantity,
             updated_at = now()
       where id     = p_batch_id
         and org_id = v_org_id
      returning quantity into v_new_quantity;

      -- quantity_delta is negative for consumption.
      insert into public.transactions
        (org_id, warehouse_id, batch_id, item_id, type, quantity_delta, idempotency_key, note, source, created_by)
      values
        (v_org_id, v_warehouse_id, p_batch_id, v_batch_item_id, 'consumption', -p_quantity, p_idempotency_key, p_note, p_source, v_user_id)
      returning id into v_txn_id;

    exception when unique_violation then
      -- Savepoint rolled back automatically (UPDATE + INSERT undone).
      -- Read the persisted batch_id from the existing transaction row so the
      -- response is consistent even if the caller reused the key for a
      -- different batch (mirrors the fix in adjust_batch_quantity).
      select t.batch_id, t.id, b.quantity
        into v_existing_batch_id, v_existing_txn_id, v_existing_qty
        from public.transactions t
        join public.batches b on b.id = t.batch_id
       where t.org_id = v_org_id
         and t.idempotency_key = p_idempotency_key
       limit 1;

      if not found then
        -- Fix: was 'FORBIDDEN'; CONFLICT is correct — this is a data anomaly,
        -- not an authorisation failure.
        raise exception 'CONFLICT';
      end if;

      return query select v_existing_batch_id, v_existing_txn_id, v_existing_qty;
      return;
    end;
  else
    -- No idempotency key: lock + verify + write directly.
    select b.item_id, b.quantity
      into v_batch_item_id, v_batch_quantity
      from public.batches b
     where b.id = p_batch_id
       and b.org_id = v_org_id
     for update;

    if v_batch_item_id is null then
      raise exception 'BATCH_NOT_FOUND';
    end if;

    if v_batch_quantity < p_quantity then
      raise exception 'INSUFFICIENT_STOCK';
    end if;

    update public.batches
       set quantity   = quantity - p_quantity,
           updated_at = now()
     where id     = p_batch_id
       and org_id = v_org_id
    returning quantity into v_new_quantity;

    insert into public.transactions
      (org_id, warehouse_id, batch_id, item_id, type, quantity_delta, idempotency_key, note, source, created_by)
    values
      (v_org_id, v_warehouse_id, p_batch_id, v_batch_item_id, 'consumption', -p_quantity, p_idempotency_key, p_note, p_source, v_user_id)
    returning id into v_txn_id;
  end if;

  return query select p_batch_id, v_txn_id, v_new_quantity;
end;
$$;

commit;
