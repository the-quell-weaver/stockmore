import { type NextRequest, NextResponse } from "next/server";
import { bootstrapDefaultOrgAndWarehouse } from "@/lib/auth/bootstrap";
import { seedDemoData } from "@/lib/demo/seed-demo-data";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { supabase, finalizeResponse } = createRouteHandlerClient(request);

  // AC5: Redirect authenticated non-anonymous users to /stock (preserve session)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !(user as { is_anonymous?: boolean }).is_anonymous) {
    return finalizeResponse(
      NextResponse.redirect(new URL("/stock", request.url)),
    );
  }

  // R1: Always create a fresh anonymous session — sign out any existing anon session
  if ((user as { is_anonymous?: boolean } | null)?.is_anonymous) {
    await supabase.auth.signOut();
  }

  // Step 1: Anonymous sign-in
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) {
    return finalizeResponse(
      NextResponse.redirect(
        new URL("/demo/error?error=SIGN_IN_FAILED", request.url),
      ),
    );
  }

  // Step 2: Bootstrap org + default warehouse (existing RPC)
  try {
    await bootstrapDefaultOrgAndWarehouse(supabase);
  } catch {
    return finalizeResponse(
      NextResponse.redirect(
        new URL("/demo/error?error=BOOTSTRAP_FAILED", request.url),
      ),
    );
  }

  // Step 3: Seed demo data (idempotent)
  const seedResult = await seedDemoData(supabase);
  if (!seedResult.ok) {
    return finalizeResponse(
      NextResponse.redirect(
        new URL(`/demo/error?error=${seedResult.error}`, request.url),
      ),
    );
  }

  // Step 4: Redirect to stock
  return finalizeResponse(
    NextResponse.redirect(new URL("/stock?mode=consume", request.url)),
  );
}
