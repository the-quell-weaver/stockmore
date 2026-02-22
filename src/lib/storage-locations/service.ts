import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { LocationError, LOCATION_ERROR_CODES } from "@/lib/storage-locations/errors";
import {
  type CreateLocationInput,
  type RenameLocationInput,
  validateCreateLocationInput,
  validateRenameLocationInput,
} from "@/lib/storage-locations/validation";

type Membership = {
  org_id: string;
  warehouse_id: string;
  role: "owner" | "editor" | "viewer";
  userId: string;
};

type StorageLocationRow = {
  id: string;
  org_id: string;
  warehouse_id: string;
  name: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type StorageLocation = {
  id: string;
  orgId: string;
  warehouseId: string;
  name: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export async function listStorageLocations(
  supabase: SupabaseClient,
): Promise<StorageLocation[]> {
  const membership = await getMembership(supabase);

  const { data, error } = await supabase
    .from("storage_locations")
    .select("id, org_id, warehouse_id, name, created_by, updated_by, created_at, updated_at")
    .eq("org_id", membership.org_id)
    .eq("warehouse_id", membership.warehouse_id)
    .order("name", { ascending: true });

  if (error) {
    throw mapLocationDbError(error);
  }

  return (data ?? []).map(mapStorageLocationRow);
}

export async function createStorageLocation(
  supabase: SupabaseClient,
  input: CreateLocationInput,
): Promise<StorageLocation> {
  const validated = validateCreateLocationInput(input);
  const membership = await getWritableContext(supabase);

  const { data, error } = await supabase
    .from("storage_locations")
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
    throw mapLocationDbError(error);
  }

  return mapStorageLocationRow(data);
}

export async function renameStorageLocation(
  supabase: SupabaseClient,
  locationId: string,
  input: RenameLocationInput,
): Promise<StorageLocation> {
  const validated = validateRenameLocationInput(input);
  const membership = await getWritableContext(supabase);

  const { data, error } = await supabase
    .from("storage_locations")
    .update({
      name: validated.name,
      updated_by: membership.userId,
    })
    .eq("id", locationId)
    .eq("org_id", membership.org_id)
    .eq("warehouse_id", membership.warehouse_id)
    .select("id, org_id, warehouse_id, name, created_by, updated_by, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw mapLocationDbError(error);
  }

  if (!data) {
    throw new LocationError(LOCATION_ERROR_CODES.LOCATION_NOT_FOUND);
  }

  return mapStorageLocationRow(data);
}

async function getWritableContext(supabase: SupabaseClient): Promise<Membership> {
  const membership = await getMembership(supabase);
  if (membership.role !== "owner" && membership.role !== "editor") {
    throw new LocationError(LOCATION_ERROR_CODES.FORBIDDEN);
  }
  return membership;
}

async function getMembership(supabase: SupabaseClient): Promise<Membership> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    throw new LocationError(LOCATION_ERROR_CODES.FORBIDDEN);
  }

  const userId = userData.user.id;

  const { data: membership, error: membershipError } = await supabase
    .from("org_memberships")
    .select("org_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership?.org_id || !membership.role) {
    throw new LocationError(LOCATION_ERROR_CODES.FORBIDDEN);
  }

  const { data: warehouse, error: warehouseError } = await supabase
    .from("warehouses")
    .select("id")
    .eq("org_id", membership.org_id)
    .eq("is_default", true)
    .maybeSingle();

  if (warehouseError || !warehouse?.id) {
    throw new LocationError(LOCATION_ERROR_CODES.FORBIDDEN);
  }

  return {
    org_id: membership.org_id,
    warehouse_id: warehouse.id,
    role: membership.role,
    userId,
  };
}

function mapStorageLocationRow(row: StorageLocationRow): StorageLocation {
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

function mapLocationDbError(error: PostgrestError): LocationError {
  if (error.code === "23505") {
    return new LocationError(LOCATION_ERROR_CODES.LOCATION_NAME_CONFLICT);
  }
  if (error.code === "42501") {
    return new LocationError(LOCATION_ERROR_CODES.FORBIDDEN);
  }
  if (error.code === "PGRST116") {
    return new LocationError(LOCATION_ERROR_CODES.LOCATION_NOT_FOUND);
  }
  return new LocationError(LOCATION_ERROR_CODES.FORBIDDEN, error.message);
}
