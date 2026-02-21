import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type AuthContext = {
  orgId: string;
  warehouseId: string;
  warehouseName: string | null;
};

export async function getAuthContext(
  supabase?: SupabaseClient,
): Promise<AuthContext | null> {
  const client = supabase ?? (await createClient());
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError || !userData?.user) {
    return null;
  }

  const { data: membership, error: membershipError } = await client
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (membershipError || !membership?.org_id) {
    return null;
  }

  const { data: warehouse, error: warehouseError } = await client
    .from("warehouses")
    .select("id, name")
    .eq("org_id", membership.org_id)
    .eq("is_default", true)
    .maybeSingle();

  if (warehouseError || !warehouse?.id) {
    return null;
  }

  return {
    orgId: membership.org_id,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name ?? null,
  };
}
