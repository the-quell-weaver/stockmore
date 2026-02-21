import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { AUTH_ERROR_CODES } from "@/lib/auth/errors";

export async function requireUser(
  supabase: SupabaseClient,
  nextPath: string,
) {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect(
      `/login?error=${AUTH_ERROR_CODES.AUTH_REQUIRED}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  return data.claims;
}
