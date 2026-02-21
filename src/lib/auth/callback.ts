import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { AUTH_ERROR_CODES, type AuthErrorCode } from "@/lib/auth/errors";
import { sanitizeNextPath } from "@/lib/auth/validation";

const DEFAULT_NEXT_PATH = "/stock";

function redirectToLogin(
  requestUrl: URL,
  nextPath: string,
  errorCode: AuthErrorCode,
) {
  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("error", errorCode);
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
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

  const supabase = await createClient();
  let error: Error | null = null;

  if (code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    error = exchangeError ?? null;
  } else if (tokenHash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    error = verifyError ?? null;
  } else {
    error = new Error("Missing auth code or token hash");
  }

  if (error) {
    return redirectToLogin(
      requestUrl,
      nextPath,
      AUTH_ERROR_CODES.AUTH_LINK_INVALID_OR_EXPIRED,
    );
  }

  const redirectUrl = new URL(nextPath, requestUrl.origin);
  return NextResponse.redirect(redirectUrl);
}
