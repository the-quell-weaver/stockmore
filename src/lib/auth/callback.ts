import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createRouteHandlerClient } from "@/lib/supabase/server";
import { AUTH_ERROR_CODES, type AuthErrorCode } from "@/lib/auth/errors";
import { bootstrapDefaultOrgAndWarehouse } from "@/lib/auth/bootstrap";
import { sanitizeNextPath } from "@/lib/auth/validation";

const DEFAULT_NEXT_PATH = "/stock";

function redirectToLogin(
  finalizeResponse: (response: NextResponse) => NextResponse,
  requestUrl: URL,
  nextPath: string,
  errorCode: AuthErrorCode,
  debug?: string,
) {
  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("error", errorCode);
  loginUrl.searchParams.set("next", nextPath);
  if (debug && process.env.NODE_ENV === "development") {
    loginUrl.searchParams.set("debug", debug);
  }
  return finalizeResponse(NextResponse.redirect(loginUrl));
}

export async function handleAuthCallback(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawTokenHash = requestUrl.searchParams.get("token_hash");
  const rawToken = requestUrl.searchParams.get("token");
  const tokenHash = rawTokenHash ?? rawToken;
  const rawType = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const type = rawType ?? (tokenHash ? "magiclink" : null);
  const nextPath = sanitizeNextPath(
    requestUrl.searchParams.get("next"),
    DEFAULT_NEXT_PATH,
  );

  const { supabase, finalizeResponse } = createRouteHandlerClient(request);
  let error: Error | null = null;

  if (process.env.NODE_ENV !== "production") {
    console.info("[auth/callback] incoming", {
      host: requestUrl.host,
      hasCode: Boolean(code),
      hasTokenHash: Boolean(rawTokenHash),
      hasToken: Boolean(rawToken),
      type,
      nextPath,
    });
  }
  try {
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
        code,
      );
      error = exchangeError;
    } else if (tokenHash && type) {
      error = await verifyMagicLinkToken(supabase, type, tokenHash, rawToken);
    } else {
      error = new Error("Missing auth code or token hash");
    }
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error("Auth callback failed");
  }

  if (error) {
    const authErrorCode =
      typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
    if (process.env.NODE_ENV !== "production") {
      console.warn("[auth/callback] auth exchange failed", {
        code: authErrorCode || undefined,
        message: error.message,
        hasCode: Boolean(code),
        hasTokenHash: Boolean(rawTokenHash),
        hasToken: Boolean(rawToken),
      });
    }
    return redirectToLogin(
      finalizeResponse,
      requestUrl,
      nextPath,
      AUTH_ERROR_CODES.AUTH_LINK_INVALID_OR_EXPIRED,
      authErrorCode || error.message,
    );
  }

  try {
    await bootstrapDefaultOrgAndWarehouse(supabase);
  } catch {
    return redirectToLogin(
      finalizeResponse,
      requestUrl,
      nextPath,
      AUTH_ERROR_CODES.BOOTSTRAP_FAILED,
    );
  }

  const redirectUrl = new URL(nextPath, requestUrl.origin);
  return finalizeResponse(NextResponse.redirect(redirectUrl));
}

async function verifyMagicLinkToken(
  supabase: ReturnType<typeof createRouteHandlerClient>["supabase"],
  type: EmailOtpType,
  tokenHash: string,
  rawToken: string | null,
): Promise<Error | null> {
  const primary = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (!primary.error) return null;

  // Some Supabase local/dev links still provide `token=...` that behaves like
  // legacy token verification rather than token_hash verification.
  if (!rawToken) return primary.error;

  const legacy = await supabase.auth.verifyOtp({
    type,
    token: rawToken,
  } as never);

  return legacy.error ?? null;
}
