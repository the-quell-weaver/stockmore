import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { AUTH_ERROR_CODES } from "@/lib/auth/errors";

export async function requireUser(
  supabase: SupabaseClient,
  nextPath: string,
) {
  let claims: unknown = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    claims = error ? null : data?.claims ?? null;
  } catch {
    await supabase.auth.signOut?.().catch(() => undefined);
    claims = null;
  }

  if (!claims) {
    redirect(
      `/login?error=${AUTH_ERROR_CODES.AUTH_REQUIRED}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  return claims;
}
