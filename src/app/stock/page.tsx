import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AUTH_ERROR_CODES } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/server";

async function StockContent() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect(`/login?error=${AUTH_ERROR_CODES.AUTH_REQUIRED}&next=/stock`);
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-xl space-y-4 rounded border border-border p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Stock</h1>
          <p className="text-sm text-muted-foreground">已登入</p>
        </div>
        <div className="rounded bg-muted p-4">
          <p className="text-sm">倉庫：尚未建立</p>
          <p className="text-sm text-muted-foreground">
            完成 onboarding 後會顯示預設倉庫。
          </p>
        </div>
      </div>
    </div>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockContent />
    </Suspense>
  );
}
