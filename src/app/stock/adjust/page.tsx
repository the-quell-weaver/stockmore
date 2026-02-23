import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Suspense } from "react";

import { adjustBatchQuantityAction } from "@/app/stock/adjust/actions";
import { requireUser } from "@/lib/auth/require-user";
import { listItems } from "@/lib/items/service";
import { listBatchesForItem } from "@/lib/transactions/service";
import { createClient } from "@/lib/supabase/server";

type AdjustSearchParams = {
  itemId?: string;
  error?: string;
  success?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  QUANTITY_INVALID: "數量必須為大於等於 0 的數字",
  BATCH_NOT_FOUND: "找不到指定批次",
  FORBIDDEN: "權限不足",
  CONFLICT: "操作衝突，請重試",
};

async function AdjustContent({
  searchParams,
}: {
  searchParams: Promise<AdjustSearchParams>;
}) {
  const supabase = await createClient();
  await requireUser(supabase, "/stock/adjust");

  const params = await searchParams;
  const selectedItemId = params.itemId ?? "";

  const items = await listItems(supabase);
  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;
  const batches =
    selectedItem !== null ? await listBatchesForItem(supabase, selectedItemId) : [];

  const errorMessage = params.error ? (ERROR_MESSAGES[params.error] ?? params.error) : null;

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 md:p-6"
      data-testid="adjust-page"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">盤點/調整</h1>
          <p className="text-sm text-muted-foreground">指定批次的實際數量（盤點結果）</p>
        </div>
        <Link href="/stock" className="text-sm underline">
          回到 Stock
        </Link>
      </div>

      {errorMessage ? (
        <p
          className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm"
          data-testid="adjust-error"
        >
          操作失敗：{errorMessage}
        </p>
      ) : null}
      {params.success ? (
        <p
          className="rounded border border-primary/20 bg-primary/10 p-3 text-sm"
          data-testid="adjust-success"
        >
          已記錄調整
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>尚未建立任何品項。</p>
          <Link href="/stock/items" className="mt-2 inline-block underline">
            前往新增品項
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Step 1: Select item */}
          <section className="rounded border p-4">
            <h2 className="mb-3 text-base font-medium">1. 選擇品項</h2>
            <form method="get" className="flex gap-2">
              <select
                name="itemId"
                defaultValue={selectedItemId}
                className="h-10 flex-1 rounded border px-3 bg-background text-sm"
                data-testid="item-select"
              >
                <option value="">— 選擇品項 —</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（{item.unit}）
                  </option>
                ))}
              </select>
              <button type="submit" className="h-10 rounded border px-4 text-sm">
                確認
              </button>
            </form>
          </section>

          {/* Step 2: Batch list with per-batch adjust form */}
          {selectedItem ? (
            <section className="rounded border p-4">
              <h2 className="mb-3 text-base font-medium">
                2. 選擇批次 — {selectedItem.name}
              </h2>

              {batches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  此品項目前無庫存批次。請先進行入庫。
                </p>
              ) : (
                <div className="space-y-4" data-testid="batch-list">
                  {batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="rounded border p-3 text-sm"
                      data-testid={`batch-summary-${batch.id}`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-medium" data-testid="batch-summary-quantity">
                          現有庫存：{batch.quantity} {selectedItem.unit}
                        </span>
                        {batch.expiryDate ? (
                          <span
                            className="text-xs text-muted-foreground"
                            data-testid="batch-summary-expiry"
                          >
                            到期：{batch.expiryDate}
                          </span>
                        ) : null}
                      </div>

                      <form
                        action={adjustBatchQuantityAction}
                        className="grid gap-2"
                        data-testid="adjust-form"
                      >
                        <input type="hidden" name="batchId" value={batch.id} />
                        <input type="hidden" name="idempotencyKey" value={randomUUID()} />

                        <div className="flex items-center gap-2">
                          <label className="text-sm text-muted-foreground whitespace-nowrap">
                            盤點實際數量
                          </label>
                          <input
                            name="actualQuantity"
                            type="number"
                            min={0}
                            step="any"
                            required
                            placeholder="實際數量"
                            className="h-10 w-32 rounded border px-3"
                            data-testid="adjust-quantity-input"
                          />
                          <span className="text-sm text-muted-foreground">
                            {selectedItem.unit}
                          </span>
                        </div>

                        <textarea
                          name="note"
                          rows={2}
                          placeholder="備註（可選，例如：盤點修正/遺失/過期丟棄）"
                          className="min-h-12 rounded border px-3 py-2 text-sm"
                          data-testid="adjust-note-input"
                        />

                        <button
                          type="submit"
                          className="h-10 rounded bg-primary px-4 text-sm text-primary-foreground"
                          data-testid="submit-adjust"
                        >
                          確認調整
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<AdjustSearchParams>;
}) {
  return (
    <Suspense fallback={null}>
      <AdjustContent searchParams={searchParams} />
    </Suspense>
  );
}
