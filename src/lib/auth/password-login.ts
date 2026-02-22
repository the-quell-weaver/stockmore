import type { SupabaseClient } from "@supabase/supabase-js";

import { AUTH_ERROR_CODES, getAuthErrorMessage } from "@/lib/auth/errors";

type PasswordLoginClient = Pick<SupabaseClient, "rpc"> & {
  auth: Pick<SupabaseClient["auth"], "signInWithPassword" | "signOut">;
};

type PasswordLoginInput = {
  email: string;
  password: string;
};

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

export async function signInWithPasswordAndBootstrap(
  supabase: PasswordLoginClient,
  input: PasswordLoginInput,
) {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (signInError) {
    throw signInError;
  }

  const { data, error: bootstrapError } = await supabase.rpc(
    "bootstrap_default_org_and_warehouse",
  );
  const row = parseBootstrapRow(data);

  if (bootstrapError || !row?.org_id || !row.warehouse_id) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new Error(getAuthErrorMessage(AUTH_ERROR_CODES.BOOTSTRAP_FAILED));
  }
}
