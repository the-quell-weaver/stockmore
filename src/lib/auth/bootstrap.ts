import type { SupabaseClient } from "@supabase/supabase-js";

import { AUTH_ERROR_CODES } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

export type BootstrapResult = {
  orgId: string;
  warehouseId: string;
};

export class BootstrapError extends Error {
  readonly code = AUTH_ERROR_CODES.BOOTSTRAP_FAILED;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "BootstrapError";
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

function parseBootstrapRow(data: unknown): {
  org_id: string;
  warehouse_id: string;
} | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    const [first] = data;
    return first && typeof first === "object"
      ? (first as { org_id: string; warehouse_id: string })
      : null;
  }
  if (typeof data === "object") {
    return data as { org_id: string; warehouse_id: string };
  }
  return null;
}

export async function bootstrapDefaultOrgAndWarehouse(
  supabase?: SupabaseClient,
): Promise<BootstrapResult> {
  const client = supabase ?? (await createClient());
  const { data: userData, error: userError } = await client.auth.getUser();

  if (userError || !userData?.user) {
    throw new BootstrapError("Missing authenticated user", userError ?? undefined);
  }

  const { data, error } = await client.rpc(
    "bootstrap_default_org_and_warehouse",
  );

  if (error) {
    throw new BootstrapError("Bootstrap RPC failed", error);
  }

  const row = parseBootstrapRow(data);
  if (!row?.org_id || !row?.warehouse_id) {
    throw new BootstrapError("Bootstrap RPC returned empty result");
  }

  return { orgId: row.org_id, warehouseId: row.warehouse_id };
}
