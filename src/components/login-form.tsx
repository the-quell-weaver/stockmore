"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  AUTH_ERROR_CODES,
  getAuthErrorMessage,
  parseAuthErrorCode,
} from "@/lib/auth/errors";
import { isValidEmail, sanitizeNextPath } from "@/lib/auth/validation";

const DEFAULT_NEXT_PATH = "/stock";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showParamError, setShowParamError] = useState(true);
  const searchParams = useSearchParams();

  const nextPath = sanitizeNextPath(
    searchParams.get("next"),
    DEFAULT_NEXT_PATH,
  );
  const paramError = parseAuthErrorCode(searchParams.get("error"));
  const paramErrorMessage = paramError
    ? getAuthErrorMessage(paramError)
    : null;
  const effectiveError = error ?? (showParamError ? paramErrorMessage : null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);
    setShowParamError(false);

    const normalizedEmail = email.trim();
    if (!isValidEmail(normalizedEmail)) {
      setError(getAuthErrorMessage(AUTH_ERROR_CODES.AUTH_EMAIL_INVALID));
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    try {
      const normalizedOrigin = normalizeLoopbackOrigin(window.location);
      const redirectUrl = new URL("/auth/callback", normalizedOrigin);
      redirectUrl.searchParams.set("next", nextPath);
      redirectUrl.searchParams.set("type", "magiclink");

      // Keep redirect URL construction in one place for testing and audits.

      let { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectUrl.toString(),
        },
      });
      if (isRefreshTokenNotFoundError(error)) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        ({ error } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            emailRedirectTo: redirectUrl.toString(),
          },
        }));
      }
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a magic link to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  suppressHydrationWarning
                />
              </div>
              {effectiveError && (
                <p className="text-sm text-red-500">{effectiveError}</p>
              )}
              {success && (
                <p className="text-sm text-emerald-600">
                  Check your email for the magic link to sign in.
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending..." : "Send magic link"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link href="/auth/sign-up" className="underline underline-offset-4">
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeLoopbackOrigin(location: Location): string {
  const hostname = location.hostname;
  if (hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1") {
    return location.origin.replace(hostname, "localhost");
  }
  return location.origin;
}

function isRefreshTokenNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "refresh_token_not_found" ||
    candidate.message?.includes("Refresh Token Not Found") === true
  );
}
