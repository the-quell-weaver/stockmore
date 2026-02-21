import { Suspense } from "react";

import { AuthExchangeClient } from "@/components/auth/auth-exchange-client";

export default function AuthExchangePage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense
          fallback={
            <div className="rounded border border-border p-6 text-sm text-muted-foreground">
              Finishing sign-in...
            </div>
          }
        >
          <AuthExchangeClient />
        </Suspense>
      </div>
    </div>
  );
}
