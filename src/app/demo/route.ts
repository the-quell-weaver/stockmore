import { type NextRequest, NextResponse } from "next/server";
import { bootstrapDefaultOrgAndWarehouse } from "@/lib/auth/bootstrap";
import { DEMO_ERROR_CODES } from "@/lib/demo/errors";
import { seedDemoData } from "@/lib/demo/seed-demo-data";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { supabase, finalizeResponse } = createRouteHandlerClient(request);

  // AC5: Redirect authenticated non-anonymous users to /stock (preserve session)
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();
  // AuthSessionMissingError means no cookie is present — this is the normal
  // state for a first-time visitor and should be treated as unauthenticated.
  // Any other error means we cannot determine session state and we bail out
  // rather than risk overwriting a real user's session.
  const sessionMissing = getUserError?.name === "AuthSessionMissingError";
  if (getUserError && !sessionMissing) {
    return finalizeResponse(
      NextResponse.redirect(
        new URL(
          `/demo/error?error=${DEMO_ERROR_CODES.SIGN_IN_FAILED}`,
          request.url,
        ),
      ),
    );
  }
  if (user && !user.is_anonymous) {
    return finalizeResponse(
      NextResponse.redirect(new URL("/stock", request.url)),
    );
  }

  // R1: Always create a fresh anonymous session — sign out any existing anon session
  if (user?.is_anonymous) {
    await supabase.auth.signOut();
  }

  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) {
    return finalizeResponse(
      NextResponse.redirect(
        new URL(
          `/demo/error?error=${DEMO_ERROR_CODES.SIGN_IN_FAILED}`,
          request.url,
        ),
      ),
    );
  }

  try {
    await bootstrapDefaultOrgAndWarehouse(supabase);
  } catch {
    return finalizeResponse(
      NextResponse.redirect(
        new URL(
          `/demo/error?error=${DEMO_ERROR_CODES.BOOTSTRAP_FAILED}`,
          request.url,
        ),
      ),
    );
  }

  const seedResult = await seedDemoData(supabase);
  if (!seedResult.ok) {
    return finalizeResponse(
      NextResponse.redirect(
        new URL(`/demo/error?error=${seedResult.error}`, request.url),
      ),
    );
  }

  return finalizeResponse(
    NextResponse.redirect(new URL("/stock?mode=consume", request.url)),
  );
}
