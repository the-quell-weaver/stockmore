"use client";

import dynamic from "next/dynamic";

const LoginFormNoSSR = dynamic(
  () => import("@/components/login-form").then((mod) => mod.LoginForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded border border-border p-6 text-sm text-muted-foreground">
        Loading login form...
      </div>
    ),
  },
);

export function LoginFormClient() {
  return <LoginFormNoSSR />;
}
