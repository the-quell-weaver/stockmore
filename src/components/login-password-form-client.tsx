"use client";

import dynamic from "next/dynamic";

const LoginPasswordFormNoSSR = dynamic(
  () =>
    import("@/components/login-password-form").then(
      (mod) => mod.LoginPasswordForm,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded border border-border p-6 text-sm text-muted-foreground">
        Loading...
      </div>
    ),
  },
);

export function LoginPasswordFormClient() {
  return <LoginPasswordFormNoSSR />;
}
