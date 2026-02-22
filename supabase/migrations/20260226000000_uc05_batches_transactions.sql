-- UC_05 Transactions – Inbound: batches, transactions tables + atomic RPC functions.
-- append-only: transactions has NO update/delete RLS policies (ever).
-- All writes go through create_inbound_batch / add_inbound_to_batch RPCs (security definer).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. batches
-- ─────────────────────────────────────────────────────────────────────────────

create table public.batches (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references public.orgs (id) on delete cascade,
  warehouse_id        uuid        not null references public.warehouses (id) on delete cascade,
  item_id             uuid        not null references public.items (id) on delete restrict,
  quantity            integer     not null default 0 check (quantity >= 0),
  expiry_date         date        null,
  storage_location_id uuid        null references public.storage_locations (id) on delete set null,
  tag_id              uuid        null references public.tags (id) on delete set null,
  created_by          uuid        not null references auth.users (id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index batches_org_id_idx         on public.batches (org_id);
create index batches_item_id_idx        on public.batches (item_id);
create index batches_warehouse_id_idx   on public.batches (warehouse_id);

create or replace function public.set_batches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger batches_set_updated_at
before update on public.batches
for each row
execute function public.set_batches_updated_at();

alter table public.batches enable row level security;

-- org members can read their own batches
create policy batches_select_org_member
  on public.batches
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = batches.org_id
        and m.user_id = auth.uid()
    )
  );

-- No INSERT / UPDATE / DELETE client-side policies: all writes go through RPC.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. transactions
-- ─────────────────────────────────────────────────────────────────────────────

create table public.transactions (
  id                uuid        primary key default gen_random_uuid(),
  org_id            uuid        not null references public.orgs (id) on delete cascade,
  warehouse_id      uuid        not null references public.warehouses (id) on delete cascade,
  batch_id          uuid        not null references public.batches (id) on delete restrict,
  item_id           uuid        not null references public.items (id) on delete restrict,
  type              text        not null,
  quantity_delta    integer     not null,
  idempotency_key   text        null,
  note              text        null,
  source            text        null default 'web',
  created_by        uuid        not null references auth.users (id) on delete restrict,
  created_at        timestamptz not null default now()
);

-- append-only: no updated_at column needed (rows never change)
create index transactions_org_id_idx       on public.transactions (org_id);
create index transactions_batch_id_idx     on public.transactions (batch_id);
create index transactions_item_id_idx      on public.transactions (item_id);
create index transactions_created_at_idx   on public.transactions (created_at);

-- idempotency: unique per (org_id, idempotency_key); NULLs are always distinct (allowed duplicates)
create unique index transactions_org_idempotency_key
  on public.transactions (org_id, idempotency_key)
  where idempotency_key is not null;

alter table public.transactions enable row level security;

-- org members can read their own transactions
create policy transactions_select_org_member
  on public.transactions
  for select
  using (
    exists (
      select 1
      from public.org_memberships m
      where m.org_id = transactions.org_id
        and m.user_id = auth.uid()
    )
  );

-- No INSERT / UPDATE / DELETE client-side policies: all writes go through RPC.
-- append-only: UPDATE and DELETE are intentionally never granted.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: create_inbound_batch
--    Creates a new batch + inbound transaction atomically (security definer).
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

  return query select v_batch_id, v_txn_id, p_quantity;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: add_inbound_to_batch
--    Adds quantity to an existing batch + inbound transaction atomically.
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
