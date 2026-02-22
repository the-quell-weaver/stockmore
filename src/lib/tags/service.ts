import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { TagError, TAG_ERROR_CODES } from "@/lib/tags/errors";
import {
  type CreateTagInput,
  type RenameTagInput,
  validateCreateTagInput,
  validateRenameTagInput,
} from "@/lib/tags/validation";

type Membership = {
  org_id: string;
  warehouse_id: string;
  role: "owner" | "editor" | "viewer";
  userId: string;
};

type TagRow = {
  id: string;
  org_id: string;
  warehouse_id: string;
  name: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  orgId: string;
  warehouseId: string;
  name: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export async function listTags(supabase: SupabaseClient): Promise<Tag[]> {
  const membership = await getMembership(supabase);

  const { data, error } = await supabase
    .from("tags")
    .select("id, org_id, warehouse_id, name, created_by, updated_by, created_at, updated_at")
    .eq("org_id", membership.org_id)
    .eq("warehouse_id", membership.warehouse_id)
    .order("name", { ascending: true });

  if (error) {
    throw mapTagDbError(error);
  }

  return (data ?? []).map(mapTagRow);
}

export async function createTag(
  supabase: SupabaseClient,
  input: CreateTagInput,
): Promise<Tag> {
  const validated = validateCreateTagInput(input);
  const membership = await getWritableContext(supabase);

  const { data, error } = await supabase
    .from("tags")
    .insert({
      org_id: membership.org_id,
      warehouse_id: membership.warehouse_id,
      name: validated.name,
      created_by: membership.userId,
      updated_by: membership.userId,
    })
    .select("id, org_id, warehouse_id, name, created_by, updated_by, created_at, updated_at")
    .single();

  if (error) {
    throw mapTagDbError(error);
  }

  return mapTagRow(data);
}

export async function renameTag(
  supabase: SupabaseClient,
  tagId: string,
  input: RenameTagInput,
): Promise<Tag> {
  const validated = validateRenameTagInput(input);
  const membership = await getWritableContext(supabase);

  const { data, error } = await supabase
    .from("tags")
    .update({
      name: validated.name,
      updated_by: membership.userId,
    })
    .eq("id", tagId)
    .eq("org_id", membership.org_id)
    .eq("warehouse_id", membership.warehouse_id)
    .select("id, org_id, warehouse_id, name, created_by, updated_by, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw mapTagDbError(error);
  }

  if (!data) {
    throw new TagError(TAG_ERROR_CODES.TAG_NOT_FOUND);
  }

  return mapTagRow(data);
}

async function getWritableContext(supabase: SupabaseClient): Promise<Membership> {
  const membership = await getMembership(supabase);
  if (membership.role !== "owner" && membership.role !== "editor") {
    throw new TagError(TAG_ERROR_CODES.FORBIDDEN);
  }
  return membership;
}

async function getMembership(supabase: SupabaseClient): Promise<Membership> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    throw new TagError(TAG_ERROR_CODES.FORBIDDEN);
  }

  const userId = userData.user.id;

  const { data: membership, error: membershipError } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership?.org_id || !membership.role) {
    throw new TagError(TAG_ERROR_CODES.FORBIDDEN);
  }

  const { data: warehouse, error: warehouseError } = await supabase
    .from("warehouses")
    .select("id")
    .eq("org_id", membership.org_id)
    .eq("is_default", true)
    .maybeSingle();

  if (warehouseError || !warehouse?.id) {
    throw new TagError(TAG_ERROR_CODES.FORBIDDEN);
  }

  return {
    org_id: membership.org_id,
    warehouse_id: warehouse.id,
    role: membership.role,
    userId,
  };
}

function mapTagRow(row: TagRow): Tag {
  return {
    id: row.id,
    orgId: row.org_id,
    warehouseId: row.warehouse_id,
    name: row.name,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTagDbError(error: PostgrestError): TagError {
  if (error.code === "23505") {
    return new TagError(TAG_ERROR_CODES.TAG_NAME_CONFLICT);
  }
  if (error.code === "42501") {
    return new TagError(TAG_ERROR_CODES.FORBIDDEN);
  }
  if (error.code === "PGRST116") {
    return new TagError(TAG_ERROR_CODES.TAG_NOT_FOUND);
  }
  return new TagError(TAG_ERROR_CODES.FORBIDDEN, error.message);
}
