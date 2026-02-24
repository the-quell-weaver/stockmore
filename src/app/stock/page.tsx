import { Suspense } from "react";
import Link from "next/link";

import { getAuthContext } from "@/lib/auth/context";
import { requireUser } from "@/lib/auth/require-user";
import { listItems } from "@/lib/items/service";
import { createClient } from "@/lib/supabase/server";
import { listStockBatches } from "@/lib/transactions/service";
import { StockSearch } from "@/components/stock-search";

type StockSearchParams = { q?: string | string[] };

type StockPageProps = {
  searchParams: Promise<StockSearchParams>;
};

async function StockContent({
  searchParams,
}: {
  searchParams: Promise<StockSearchParams>;
}) {
  const rawParams = await searchParams;
  const q = Array.isArray(rawParams.q) ? rawParams.q[0] : rawParams.q;
  const supabase = await createClient();
  await requireUser(supabase, "/stock");

  const context = await getAuthContext(supabase);
  const warehouseName = context?.warehouseName ?? "—";

  const [batches, items] = await Promise.all([
    listStockBatches(supabase, { q }),
    listItems(supabase),
  ]);

  const hasItems = items.length > 0;
  const hasBatches = batches.length > 0;
  const isFiltered = Boolean(q?.trim());

  return (
    <div className="mx-auto w-full max-w-xl p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">庫存列表</h1>
          <p className="text-sm text-muted-foreground">倉庫：{warehouseName}</p>
        </div>
        <nav className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Link href="/stock/items" className="hover:underline">管理品項</Link>
          <Link href="/stock/locations" className="hover:underline">存放點</Link>
          <Link href="/stock/tags" className="hover:underline">標籤</Link>
        </nav>
      </div>

      {/* Sticky search */}
      <div className="sticky top-0 z-10 bg-background pb-3 pt-1">
        <StockSearch defaultQ={q} />
      </div>

      {/* Quick action */}
      <div className="mb-4 flex gap-2">
        <Link
          href="/stock/inbound"
          className="inline-flex h-9 items-center rounded bg-primary px-4 text-sm text-primary-foreground"
        >
          + 入庫
        </Link>
      </div>

      {/* Batch list or empty state */}
      {!hasBatches && !hasItems && (
        <div className="rounded border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">尚無庫存</p>
          <p className="mt-1 text-xs text-muted-foreground">請先建立品項，再進行入庫</p>
          <Link
            href="/stock/items"
            className="mt-4 inline-flex h-9 items-center rounded border px-4 text-sm"
          >
            建立品項
          </Link>
        </div>
      )}

      {!hasBatches && hasItems && !isFiltered && (
        <div className="rounded border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">尚無庫存</p>
          <p className="mt-1 text-xs text-muted-foreground">執行入庫後批次將顯示於此</p>
        </div>
      )}

      {!hasBatches && isFiltered && (
        <div className="rounded border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            找不到符合「{q}」的批次
          </p>
        </div>
      )}

      {hasBatches && (
        <ul className="space-y-3">
          {batches.map((batch) => {
            const metaParts: string[] = [];
            if (batch.expiryDate) metaParts.push(`到期：${batch.expiryDate}`);
            if (batch.storageLocationName) metaParts.push(batch.storageLocationName);
            if (batch.tagName) metaParts.push(batch.tagName);

            return (
              <li key={batch.id} className="rounded border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{batch.itemName}</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {batch.quantity}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      {batch.itemUnit}
                    </span>
                  </span>
                </div>
                {metaParts.length > 0 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {metaParts.join(" · ")}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">—</p>
                )}
                <div className="mt-2 flex gap-2">
                  <Link
                    href="/stock/inbound"
                    className="inline-flex h-7 items-center rounded border px-3 text-xs"
                  >
                    入庫
                  </Link>
                  <Link
                    href="/stock/consume"
                    className="inline-flex h-7 items-center rounded border px-3 text-xs"
                  >
                    消耗
                  </Link>
                  <Link
                    href="/stock/adjust"
                    className="inline-flex h-7 items-center rounded border px-3 text-xs"
                  >
                    盤點
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function StockPage({ searchParams }: StockPageProps) {
  return (
    <Suspense fallback={null}>
      <StockContent searchParams={searchParams} />
    </Suspense>
  );
}
