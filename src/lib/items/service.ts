import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { ItemError, ITEM_ERROR_CODES } from "@/lib/items/errors";
import {
  normalizeListQuery,
  type CreateItemInput,
  type ListItemsInput,
  type UpdateItemInput,
  validateCreateItemInput,
  validateUpdateItemInput,
} from "@/lib/items/validation";

type Membership = {
  org_id: string;
  role: "owner" | "editor" | "viewer";
};

type ItemRow = {
  id: string;
  org_id: string;
  name: string;
  unit: string;
  min_stock: number | string;
  default_tag_id: string | null;
  note: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  target_quantity: number | string | null;  // UC-11
};

export type Item = {
  id: string;
  orgId: string;
  name: string;
  unit: string;
  minStock: number;
  defaultTagIds: string[];
  note: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  targetQuantity: number | null;  // UC-11
};

export async function listItems(
  supabase: SupabaseClient,
  input?: ListItemsInput,
): Promise<Item[]> {
  const membership = await getMembership(supabase);
  const query = normalizeListQuery(input);

  let request = supabase
    .from("items")
    .select("id, org_id, name, unit, min_stock, default_tag_id, note, is_deleted, created_at, updated_at, target_quantity")
    .eq("org_id", membership.org_id)
    .order("name", { ascending: true });

  if (!query.includeDeleted) {
    request = request.eq("is_deleted", false);
  }
  if (query.q) {
    request = request.ilike("name", `%${query.q}%`);
  }

  const { data, error } = await request;
  if (error) {
    throw mapItemDbError(error);
  }

  return (data ?? []).map(mapItemRow);
}

export async function createItem(
  supabase: SupabaseClient,
  input: CreateItemInput,
): Promise<Item> {
  const validated = validateCreateItemInput(input);
  const { membership, userId } = await getWritableContext(supabase);

  const { data, error } = await supabase
    .from("items")
    .insert({
      org_id: membership.org_id,
      name: validated.name,
      unit: validated.unit,
      min_stock: validated.minStock,
      default_tag_id: validated.defaultTagIds?.[0] ?? null,
      note: validated.note ?? null,
      created_by: userId,
      updated_by: userId,
    })
    .select("id, org_id, name, unit, min_stock, default_tag_id, note, is_deleted, created_at, updated_at, target_quantity")
    .single();

  if (error) {
    throw mapItemDbError(error);
  }

  return mapItemRow(data);
}

export async function updateItem(
  supabase: SupabaseClient,
  itemId: string,
  patch: UpdateItemInput,
): Promise<Item> {
  const validated = validateUpdateItemInput(patch);
  const { membership, userId } = await getWritableContext(supabase);

  const payload: Record<string, unknown> = { updated_by: userId };

  if (validated.name !== undefined) payload.name = validated.name;
  if (validated.unit !== undefined) payload.unit = validated.unit;
  if (validated.minStock !== undefined) payload.min_stock = validated.minStock;
  if (validated.defaultTagIds !== undefined) {
    payload.default_tag_id = validated.defaultTagIds?.[0] ?? null;
  }
  if (validated.note !== undefined) payload.note = validated.note;
  if (validated.isDeleted !== undefined) payload.is_deleted = validated.isDeleted;
  if (validated.targetQuantity !== undefined) payload.target_quantity = validated.targetQuantity;

  const { data, error } = await supabase
    .from("items")
    .update(payload)
    .eq("id", itemId)
    .eq("org_id", membership.org_id)
    .select("id, org_id, name, unit, min_stock, default_tag_id, note, is_deleted, created_at, updated_at, target_quantity")
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      throw new ItemError(ITEM_ERROR_CODES.ITEM_NOT_FOUND);
    }
    throw mapItemDbError(error);
  }

  if (!data) {
    throw new ItemError(ITEM_ERROR_CODES.ITEM_NOT_FOUND);
  }

  return mapItemRow(data);
}

async function getWritableContext(supabase: SupabaseClient) {
  const membership = await getMembership(supabase);
  if (membership.role !== "owner" && membership.role !== "editor") {
    throw new ItemError(ITEM_ERROR_CODES.FORBIDDEN);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    throw new ItemError(ITEM_ERROR_CODES.FORBIDDEN);
  }

  return {
    membership,
    userId: userData.user.id,
  };
}

async function getMembership(
  supabase: SupabaseClient,
): Promise<Membership> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    throw new ItemError(ITEM_ERROR_CODES.FORBIDDEN);
  }

  const { data: membership, error } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error || !membership?.org_id) {
    throw new ItemError(ITEM_ERROR_CODES.FORBIDDEN);
  }

  return membership as Membership;
}

function mapItemRow(row: ItemRow): Item {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    unit: row.unit,
    minStock: Number(row.min_stock),
    defaultTagIds: row.default_tag_id ? [row.default_tag_id] : [],
    note: row.note,
    isDeleted: row.is_deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    targetQuantity: row.target_quantity != null ? Number(row.target_quantity) : null,
  };
}

function mapItemDbError(error: PostgrestError): ItemError {
  if (error.code === "23505") {
    return new ItemError(ITEM_ERROR_CODES.ITEM_NAME_CONFLICT);
  }
  if (error.code === "42501") {
    return new ItemError(ITEM_ERROR_CODES.FORBIDDEN);
  }
  return new ItemError(ITEM_ERROR_CODES.FORBIDDEN, error.message);
}
