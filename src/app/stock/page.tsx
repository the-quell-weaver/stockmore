import { Suspense } from "react";
import Link from "next/link";

import { getAuthContext } from "@/lib/auth/context";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

async function StockContent() {
  const supabase = await createClient();
  await requireUser(supabase, "/stock");

  const context = await getAuthContext(supabase);
  const warehouseName = context?.warehouseName ?? "尚未建立";

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-xl space-y-4 rounded border border-border p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Stock</h1>
          <p className="text-sm text-muted-foreground">已登入</p>
        </div>
        <div className="rounded bg-muted p-4">
          <p className="text-sm">倉庫：{warehouseName}</p>
          {!context && (
            <p className="text-sm text-muted-foreground">
              完成 onboarding 後會顯示預設倉庫。
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/stock/inbound"
            className="inline-flex h-10 items-center rounded bg-primary px-4 text-sm text-primary-foreground"
            data-testid="nav-inbound"
          >
            入庫
          </Link>
          <Link
            href="/stock/items"
            className="inline-flex h-10 items-center rounded border px-4 text-sm"
          >
            管理 Items
          </Link>
          <Link
            href="/stock/locations"
            className="inline-flex h-10 items-center rounded border px-4 text-sm"
          >
            存放點
          </Link>
          <Link
            href="/stock/tags"
            className="inline-flex h-10 items-center rounded border px-4 text-sm"
          >
            標籤
          </Link>
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
