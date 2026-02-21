import { LoginFormClient } from "@/components/login-form-client";
import { Suspense } from "react";

export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense
          fallback={
            <div className="rounded border border-border p-6 text-sm text-muted-foreground">
              Loading login form...
            </div>
          }
        >
          <LoginFormClient />
        </Suspense>
      </div>
    </div>
  );
}
