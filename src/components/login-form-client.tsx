"use client";

import dynamic from "next/dynamic";

const LoginFormNoSSR = dynamic(
  () => import("@/components/login-form").then((mod) => mod.LoginForm),
  { ssr: false, loading: () => null },
);

export function LoginFormClient() {
  return <LoginFormNoSSR />;
}
