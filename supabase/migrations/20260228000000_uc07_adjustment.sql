-- UC_07 Transactions – Adjustment: adds quantity_after to transactions, a new
-- index on (batch_id, created_at), and the adjust_batch_quantity RPC.
--
-- Design decisions:
--   • quantity_after (nullable numeric): stores the authoritative post-adjustment
--     batch quantity so replays can use it as a checkpoint without re-running all
--     deltas. NULL for older inbound/consumption rows (not back-filled).
--   • quantity_delta (existing): stores actual_quantity - prior_quantity; can be
--     negative (downward adjustment) or positive (upward correction).
--   • append-only: no UPDATE/DELETE on transactions ever granted.
--   • Idempotency: same pattern as consume_from_batch — race-safe via
--     BEGIN … EXCEPTION WHEN unique_violation THEN … (not a racy pre-check SELECT).
--   • CONFLICT error code: raised when a unique_violation is caught but the
--     matching idempotency row cannot be found (should never happen in practice).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add quantity_after column to transactions
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.transactions
  add column if not exists quantity_after numeric null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Index: support efficient per-batch transaction history queries
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists transactions_batch_id_created_at_idx
  on public.transactions (batch_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: adjust_batch_quantity
--    Sets a batch's quantity to an explicit actual value (not a delta),
--    records an adjustment transaction, and returns the new state.
--    Security definer: auth + org scoping enforced in function body.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.adjust_batch_quantity(
  p_batch_id          uuid,
  p_actual_quantity   numeric,
  p_note              text    default null,
  p_source            text    default 'web',
  p_idempotency_key   text    default null
)
returns table (batch_id uuid, transaction_id uuid, batch_quantity numeric)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
#variable_conflict use_column
declare
  v_user_id           uuid;
  v_org_id            uuid;
  v_warehouse_id      uuid;
  v_role              text;
  v_batch_item_id     uuid;
  v_prior_quantity    numeric;
  v_quantity_delta    numeric;
  v_txn_id            uuid;
  v_existing_txn_id   uuid;
  v_existing_qty      numeric;
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
  -- actual_quantity must be a finite non-negative number (0 is allowed).
  if p_actual_quantity is null or p_actual_quantity < 0 then
    raise exception 'QUANTITY_INVALID';
  end if;

  -- ── writes (race-safe idempotency via exception handler) ──────────────────
  if p_idempotency_key is not null then
    begin
      -- SELECT FOR UPDATE: lock the batch row to prevent concurrent adjustments.
      select b.item_id, b.quantity
        into v_batch_item_id, v_prior_quantity
        from public.batches b
       where b.id = p_batch_id
         and b.org_id = v_org_id
       for update;

      if v_batch_item_id is null then
        raise exception 'BATCH_NOT_FOUND';
      end if;

      v_quantity_delta := p_actual_quantity - v_prior_quantity;

      update public.batches
         set quantity   = p_actual_quantity,
             updated_at = now()
       where id     = p_batch_id
         and org_id = v_org_id;

      insert into public.transactions
        (org_id, warehouse_id, batch_id, item_id, type,
         quantity_delta, quantity_after, idempotency_key, note, source, created_by)
      values
        (v_org_id, v_warehouse_id, p_batch_id, v_batch_item_id, 'adjustment',
         v_quantity_delta, p_actual_quantity, p_idempotency_key, p_note, p_source, v_user_id)
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
        raise exception 'CONFLICT';
      end if;

      return query select p_batch_id, v_existing_txn_id, v_existing_qty;
      return;
    end;
  else
    -- No idempotency key: lock + verify + write directly.
    select b.item_id, b.quantity
      into v_batch_item_id, v_prior_quantity
      from public.batches b
     where b.id = p_batch_id
       and b.org_id = v_org_id
     for update;

    if v_batch_item_id is null then
      raise exception 'BATCH_NOT_FOUND';
    end if;

    v_quantity_delta := p_actual_quantity - v_prior_quantity;

    update public.batches
       set quantity   = p_actual_quantity,
           updated_at = now()
     where id     = p_batch_id
       and org_id = v_org_id;

    insert into public.transactions
      (org_id, warehouse_id, batch_id, item_id, type,
       quantity_delta, quantity_after, idempotency_key, note, source, created_by)
    values
      (v_org_id, v_warehouse_id, p_batch_id, v_batch_item_id, 'adjustment',
       v_quantity_delta, p_actual_quantity, p_idempotency_key, p_note, p_source, v_user_id)
    returning id into v_txn_id;
  end if;

  return query select p_batch_id, v_txn_id, p_actual_quantity;
end;
$$;

commit;
