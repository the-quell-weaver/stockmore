import { type NextRequest, NextResponse } from "next/server";
import { bootstrapDefaultOrgAndWarehouse } from "@/lib/auth/bootstrap";
import { DEMO_ERROR_CODES } from "@/lib/demo/errors";
import { seedDemoData } from "@/lib/demo/seed-demo-data";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { supabase, finalizeResponse } = createRouteHandlerClient(request);

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  // AC5: Only redirect to /stock for a confirmed non-anonymous user.
  // Any getUserError (session missing, stale, or revoked cookie) means the
  // session state is indeterminate — fall through to sign-out + anonymous sign-in.
  if (!getUserError && user && !user.is_anonymous) {
    return finalizeResponse(
      NextResponse.redirect(new URL("/stock", request.url)),
    );
  }

  // R1: Clear any existing session (unknown, stale, or anonymous) before
  // creating a fresh anonymous session. No-op when no session exists.
  await supabase.auth.signOut();

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
