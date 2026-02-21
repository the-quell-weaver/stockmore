"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AUTH_ERROR_CODES, type AuthErrorCode } from "@/lib/auth/errors";
import { sanitizeNextPath } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/client";

type AuthExchangeClientProps = {
  code: string | null;
  next: string | null;
};

export function AuthExchangeClient({ code, next }: AuthExchangeClientProps) {
  const router = useRouter();

  useEffect(() => {
    const nextPath = sanitizeNextPath(next, "/stock");

    const redirectToLogin = (errorCode: AuthErrorCode) => {
      const params = new URLSearchParams({
        error: errorCode,
        next: nextPath,
      });
      router.replace(`/login?${params.toString()}`);
    };

    const run = async () => {
      if (!code) {
        redirectToLogin(AUTH_ERROR_CODES.AUTH_LINK_INVALID_OR_EXPIRED);
        return;
      }

      const supabase = createClient();
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        redirectToLogin(AUTH_ERROR_CODES.AUTH_LINK_INVALID_OR_EXPIRED);
        return;
      }

      const { error: bootstrapError } = await supabase.rpc(
        "bootstrap_default_org_and_warehouse",
      );
      if (bootstrapError) {
        redirectToLogin(AUTH_ERROR_CODES.BOOTSTRAP_FAILED);
        return;
      }

      router.replace(nextPath);
    };

    void run();
  }, [code, next, router]);

  return (
    <div className="rounded border border-border p-6 text-sm text-muted-foreground">
      Finishing sign-in...
    </div>
  );
}
