import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { AUTH_ERROR_CODES } from "@/lib/auth/errors";

export async function requireUser(
  supabase: SupabaseClient,
  nextPath: string,
) {
  let user: unknown = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = error ? null : data?.user ?? null;
  } catch {
    user = null;
  }

  if (!user) {
    redirect(
      `/login?error=${AUTH_ERROR_CODES.AUTH_REQUIRED}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  return user;
}
