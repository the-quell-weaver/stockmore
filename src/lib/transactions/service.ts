import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { TransactionError, TRANSACTION_ERROR_CODES } from "@/lib/transactions/errors";
import {
  type ConsumeFromBatchInput,
  type CreateInboundBatchInput,
  type AddInboundToBatchInput,
  type AdjustBatchQuantityInput,
  type ListStockBatchesInput,
  validateConsumeFromBatchInput,
  validateCreateInboundBatchInput,
  validateAddInboundToBatchInput,
  validateAdjustBatchQuantityInput,
  validateListStockBatchesInput,
} from "@/lib/transactions/validation";

type Membership = {
  org_id: string;
  role: "owner" | "editor" | "viewer";
};

type RpcInboundRow = {
  batch_id: string;
  transaction_id: string;
  batch_quantity: number;
};

export type InboundResult = {
  batchId: string;
  transactionId: string;
  batchQuantity: number;
};

type RpcConsumeRow = {
  batch_id: string;
  transaction_id: string;
  batch_quantity: number;
};

export type ConsumeResult = {
  batchId: string;
  transactionId: string;
  batchQuantity: number;
};

type RpcAdjustRow = {
  batch_id: string;
  transaction_id: string;
  batch_quantity: number;
};

export type AdjustResult = {
  batchId: string;
  transactionId: string;
  batchQuantity: number;
};

type BatchRow = {
  id: string;
  org_id: string;
  warehouse_id: string;
  item_id: string;
  quantity: number;
  expiry_date: string | null;
  storage_location_id: string | null;
  tag_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Batch = {
  id: string;
  orgId: string;
  warehouseId: string;
  itemId: string;
  quantity: number;
  expiryDate: string | null;
  storageLocationId: string | null;
  tagId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function consumeFromBatch(
  supabase: SupabaseClient,
  input: ConsumeFromBatchInput,
): Promise<ConsumeResult> {
  const validated = validateConsumeFromBatchInput(input);

  const { data, error } = await supabase.rpc("consume_from_batch", {
    p_batch_id: validated.batchId,
    p_quantity: validated.quantity,
    p_note: validated.note ?? null,
    p_source: "web",
    p_idempotency_key: validated.idempotencyKey ?? null,
  });

  if (error) {
    throw mapRpcError(error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcConsumeRow | null;
  if (!row?.batch_id) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN);
  }

  return {
    batchId: row.batch_id,
    transactionId: row.transaction_id,
    batchQuantity: Number(row.batch_quantity),
  };
}

export async function createInboundBatch(
  supabase: SupabaseClient,
  input: CreateInboundBatchInput,
): Promise<InboundResult> {
  const validated = validateCreateInboundBatchInput(input);

  const { data, error } = await supabase.rpc("create_inbound_batch", {
    p_item_id: validated.itemId,
    p_quantity: validated.quantity,
    p_expiry_date: validated.expiryDate ?? null,
    p_storage_location_id: validated.storageLocationId ?? null,
    p_tag_id: validated.tagId ?? null,
    p_note: validated.note ?? null,
    p_source: "web",
    p_idempotency_key: validated.idempotencyKey ?? null,
  });

  if (error) {
    throw mapRpcError(error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcInboundRow | null;
  if (!row?.batch_id) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN);
  }

  return {
    batchId: row.batch_id,
    transactionId: row.transaction_id,
    batchQuantity: Number(row.batch_quantity),
  };
}

export async function addInboundToBatch(
  supabase: SupabaseClient,
  input: AddInboundToBatchInput,
): Promise<InboundResult> {
  const validated = validateAddInboundToBatchInput(input);

  const { data, error } = await supabase.rpc("add_inbound_to_batch", {
    p_batch_id: validated.batchId,
    p_quantity: validated.quantity,
    p_note: validated.note ?? null,
    p_source: "web",
    p_idempotency_key: validated.idempotencyKey ?? null,
  });

  if (error) {
    throw mapRpcError(error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcInboundRow | null;
  if (!row?.batch_id) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN);
  }

  return {
    batchId: row.batch_id,
    transactionId: row.transaction_id,
    batchQuantity: Number(row.batch_quantity),
  };
}

export async function adjustBatchQuantity(
  supabase: SupabaseClient,
  input: AdjustBatchQuantityInput,
): Promise<AdjustResult> {
  const validated = validateAdjustBatchQuantityInput(input);

  const { data, error } = await supabase.rpc("adjust_batch_quantity", {
    p_batch_id: validated.batchId,
    p_actual_quantity: validated.actualQuantity,
    p_note: validated.note ?? null,
    p_source: "web",
    p_idempotency_key: validated.idempotencyKey,
  });

  if (error) {
    throw mapRpcError(error);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcAdjustRow | null;
  if (!row?.batch_id) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN);
  }

  return {
    batchId: row.batch_id,
    transactionId: row.transaction_id,
    batchQuantity: Number(row.batch_quantity),
  };
}

export async function listBatchesForItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<Batch[]> {
  const membership = await getMembership(supabase);

  const { data, error } = await supabase
    .from("batches")
    .select(
      "id, org_id, warehouse_id, item_id, quantity, expiry_date, storage_location_id, tag_id, created_at, updated_at",
    )
    .eq("org_id", membership.org_id)
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });

  if (error) {
    throw mapRpcError(error);
  }

  return (data ?? []).map(mapBatchRow);
}

async function getMembership(supabase: SupabaseClient): Promise<Membership> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN);
  }

  const { data: membership, error } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error || !membership?.org_id) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN);
  }

  return membership as Membership;
}

function mapBatchRow(row: BatchRow): Batch {
  return {
    id: row.id,
    orgId: row.org_id,
    warehouseId: row.warehouse_id,
    itemId: row.item_id,
    quantity: Number(row.quantity),
    expiryDate: row.expiry_date,
    storageLocationId: row.storage_location_id,
    tagId: row.tag_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRpcError(error: PostgrestError): TransactionError {
  const msg = error.message ?? "";
  if (msg.includes("FORBIDDEN") || error.code === "42501") {
    return new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN);
  }
  if (msg.includes("QUANTITY_INVALID")) {
    return new TransactionError(TRANSACTION_ERROR_CODES.QUANTITY_INVALID);
  }
  if (msg.includes("ITEM_NOT_FOUND")) {
    return new TransactionError(TRANSACTION_ERROR_CODES.ITEM_NOT_FOUND);
  }
  if (msg.includes("BATCH_NOT_FOUND")) {
    return new TransactionError(TRANSACTION_ERROR_CODES.BATCH_NOT_FOUND);
  }
  if (msg.includes("INSUFFICIENT_STOCK")) {
    return new TransactionError(TRANSACTION_ERROR_CODES.INSUFFICIENT_STOCK);
  }
  if (msg.includes("CONFLICT")) {
    return new TransactionError(TRANSACTION_ERROR_CODES.CONFLICT);
  }
  return new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN, msg);
}

// ---------------------------------------------------------------------------
// Stock View
// ---------------------------------------------------------------------------

export type BatchWithRefs = Batch & {
  itemName: string;
  itemUnit: string;
  storageLocationName: string | null;
  tagName: string | null;
};

type BatchWithRefsRow = {
  id: string;
  org_id: string;
  warehouse_id: string;
  item_id: string;
  quantity: number;
  expiry_date: string | null;
  storage_location_id: string | null;
  tag_id: string | null;
  created_at: string;
  updated_at: string;
  items: { name: string; unit: string } | null;
  storage_locations: { name: string } | null;
  tags: { name: string } | null;
};

export async function listStockBatches(
  supabase: SupabaseClient,
  input?: ListStockBatchesInput,
): Promise<BatchWithRefs[]> {
  const membership = await getMembership(supabase);
  const validated = validateListStockBatchesInput(input ?? {});

  let query = supabase
    .from("batches")
    .select(
      "id, org_id, warehouse_id, item_id, quantity, expiry_date, storage_location_id, tag_id, created_at, updated_at, items!inner(name, unit), storage_locations(name), tags(name)",
    )
    .eq("org_id", membership.org_id)
    .eq("items.is_deleted", false)
    .order("name", { referencedTable: "items", ascending: true })
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(validated.limit);

  if (validated.q) {
    query = query.ilike("items.name", `%${validated.q}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw mapRpcError(error);
  }

  const rows = (data ?? []) as unknown as BatchWithRefsRow[];

  return rows
    .filter((row) => row.items !== null)
    .map((row) => ({
      id: row.id,
      orgId: row.org_id,
      warehouseId: row.warehouse_id,
      itemId: row.item_id,
      quantity: Number(row.quantity),
      expiryDate: row.expiry_date,
      storageLocationId: row.storage_location_id,
      tagId: row.tag_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      itemName: row.items!.name,
      itemUnit: row.items!.unit,
      storageLocationName: row.storage_locations?.name ?? null,
      tagName: row.tags?.name ?? null,
    }));
}
