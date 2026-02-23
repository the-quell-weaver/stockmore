import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Suspense } from "react";

import {
  createInboundBatchAction,
  addInboundToBatchAction,
} from "@/app/stock/inbound/actions";
import { requireUser } from "@/lib/auth/require-user";
import { listItems } from "@/lib/items/service";
import { listBatchesForItem } from "@/lib/transactions/service";
import { listStorageLocations } from "@/lib/storage-locations/service";
import { listTags } from "@/lib/tags/service";
import { createClient } from "@/lib/supabase/server";

type InboundSearchParams = {
  itemId?: string;
  mode?: "new" | "existing";
  error?: string;
  success?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  QUANTITY_INVALID: "數量必須為正整數",
  ITEM_NOT_FOUND: "找不到指定品項",
  BATCH_NOT_FOUND: "找不到指定批次",
  FORBIDDEN: "權限不足",
};

async function InboundContent({
  searchParams,
}: {
  searchParams: Promise<InboundSearchParams>;
}) {
  const supabase = await createClient();
  await requireUser(supabase, "/stock/inbound");

  const params = await searchParams;
  const selectedItemId = params.itemId ?? "";
  const mode = params.mode === "existing" ? "existing" : "new";

  const [items, tags, locations] = await Promise.all([
    listItems(supabase),
    listTags(supabase),
    listStorageLocations(supabase),
  ]);

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;
  const batches =
    selectedItem !== null && mode === "existing"
      ? await listBatchesForItem(supabase, selectedItemId)
      : [];

  const errorMessage = params.error ? (ERROR_MESSAGES[params.error] ?? params.error) : null;

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 md:p-6"
      data-testid="inbound-page"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">入庫</h1>
          <p className="text-sm text-muted-foreground">新增庫存批次或補充既有批次數量</p>
        </div>
        <Link href="/stock" className="text-sm underline">
          回到 Stock
        </Link>
      </div>

      {errorMessage ? (
        <p
          className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm"
          data-testid="inbound-error"
        >
          操作失敗：{errorMessage}
        </p>
      ) : null}
      {params.success ? (
        <p
          className="rounded border border-primary/20 bg-primary/10 p-3 text-sm"
          data-testid="inbound-success"
        >
          已成功入庫
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

          {/* Step 2: Mode selection */}
          {selectedItem ? (
            <section className="rounded border p-4">
              <h2 className="mb-3 text-base font-medium">
                2. 入庫模式 — {selectedItem.name}
              </h2>
              <div className="flex gap-3">
                <Link
                  href={`/stock/inbound?itemId=${selectedItemId}&mode=new`}
                  className={`h-9 rounded border px-4 text-sm inline-flex items-center ${
                    mode === "new" ? "bg-primary text-primary-foreground" : ""
                  }`}
                  data-testid="mode-new"
                >
                  建立新批次
                </Link>
                <Link
                  href={`/stock/inbound?itemId=${selectedItemId}&mode=existing`}
                  className={`h-9 rounded border px-4 text-sm inline-flex items-center ${
                    mode === "existing" ? "bg-primary text-primary-foreground" : ""
                  }`}
                  data-testid="mode-existing"
                >
                  增加到既有批次
                </Link>
              </div>

              {/* ── New batch form ── */}
              {mode === "new" ? (
                <form
                  action={createInboundBatchAction}
                  className="mt-4 grid gap-3"
                  data-testid="inbound-new-batch-form"
                >
                  <input type="hidden" name="itemId" value={selectedItemId} />
                  <input type="hidden" name="idempotencyKey" value={randomUUID()} />

                  <label className="grid gap-1 text-sm">
                    數量（整數）
                    <div className="flex items-center gap-2">
                      <input
                        name="quantity"
                        type="number"
                        min={1}
                        step={1}
                        required
                        defaultValue={1}
                        className="h-10 w-32 rounded border px-3"
                        data-testid="quantity-input"
                      />
                      <span className="text-sm text-muted-foreground">{selectedItem.unit}</span>
                    </div>
                  </label>

                  <label className="grid gap-1 text-sm">
                    到期日（可選）
                    <input
                      name="expiryDate"
                      type="date"
                      className="h-10 rounded border px-3"
                      data-testid="expiry-date-input"
                    />
                  </label>

                  <label className="grid gap-1 text-sm">
                    存放點（可選）
                    <select
                      name="storageLocationId"
                      className="h-10 rounded border px-3 bg-background"
                    >
                      <option value="">（未指定）</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    標籤（可選）
                    <select name="tagId" className="h-10 rounded border px-3 bg-background">
                      <option value="">（無）</option>
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1 text-sm">
                    備註（可選）
                    <textarea name="note" className="min-h-16 rounded border px-3 py-2 text-sm" />
                  </label>

                  <button
                    type="submit"
                    className="h-11 rounded bg-primary px-4 text-sm text-primary-foreground"
                    data-testid="submit-inbound"
                  >
                    建立批次並入庫
                  </button>
                </form>
              ) : null}

              {/* ── Add to existing batch form ── */}
              {mode === "existing" ? (
                <div className="mt-4">
                  {batches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      此品項尚無批次，請切換為「建立新批次」。
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {batches.map((batch) => (
                        <div
                          key={batch.id}
                          className="rounded border p-3 text-sm"
                          data-testid={`batch-row-${batch.id}`}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="font-medium">
                              現有庫存：{batch.quantity} {selectedItem.unit}
                            </span>
                            {batch.expiryDate ? (
                              <span className="text-xs text-muted-foreground">
                                到期：{batch.expiryDate}
                              </span>
                            ) : null}
                          </div>
                          <form
                            action={addInboundToBatchAction}
                            className="grid gap-2"
                          >
                            <input type="hidden" name="batchId" value={batch.id} />
                            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                            <div className="flex items-center gap-2">
                              <input
                                name="quantity"
                                type="number"
                                min={1}
                                step={1}
                                required
                                defaultValue={1}
                                className="h-10 w-24 rounded border px-3"
                                data-testid={`add-quantity-${batch.id}`}
                              />
                              <span className="text-sm text-muted-foreground">
                                {selectedItem.unit}
                              </span>
                            </div>
                            <textarea
                              name="note"
                              rows={2}
                              placeholder="備註（可選）"
                              className="min-h-12 rounded border px-3 py-2 text-sm"
                              data-testid={`add-note-${batch.id}`}
                            />
                            <button
                              type="submit"
                              className="h-10 rounded border px-3 text-sm"
                              data-testid={`add-to-batch-${batch.id}`}
                            >
                              +{selectedItem.unit} 入庫
                            </button>
                          </form>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function InboundPage({
  searchParams,
}: {
  searchParams: Promise<InboundSearchParams>;
}) {
  return (
    <Suspense fallback={null}>
      <InboundContent searchParams={searchParams} />
    </Suspense>
  );
}
