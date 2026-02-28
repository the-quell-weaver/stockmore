/**
 * @deprecated UC-11: This page is superseded by `/stock?mode=restock`.
 * Navigation links have been removed. This file is kept for reference
 * and will be deleted in a future cleanup PR.
 */
import Link from "next/link";
import { Suspense } from "react";

import { createItemAction, updateItemAction } from "@/app/stock/items/actions";
import { requireUser } from "@/lib/auth/require-user";
import { listItems } from "@/lib/items/service";
import { listTags } from "@/lib/tags/service";
import { createClient } from "@/lib/supabase/server";

type ItemsSearchParams = {
  q?: string;
  error?: string;
  success?: string;
};

async function ItemsContent({
  searchParams,
}: {
  searchParams: Promise<ItemsSearchParams>;
}) {
  const supabase = await createClient();
  await requireUser(supabase, "/stock/items");

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const [items, tags] = await Promise.all([
    listItems(supabase, { q }),
    listTags(supabase),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6" data-testid="items-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Items</h1>
          <p className="text-sm text-muted-foreground">管理品項主檔：新增、編輯、搜尋</p>
        </div>
        <Link href="/stock" className="text-sm underline">
          回到 Stock
        </Link>
      </div>

      {params.error ? (
        <p className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm" data-testid="items-error">
          操作失敗：{params.error}
        </p>
      ) : null}
      {params.success ? (
        <p className="rounded border border-primary/20 bg-primary/10 p-3 text-sm" data-testid="items-success">
          操作成功：{params.success}
        </p>
      ) : null}

      <section className="rounded border p-4">
        <h2 className="text-lg font-medium">新增品項</h2>
        <form action={createItemAction} className="mt-3 grid gap-3" data-testid="create-item-form">
          <label className="grid gap-1 text-sm">
            品名
            <input name="name" required className="h-10 rounded border px-3" />
          </label>
          <label className="grid gap-1 text-sm">
            單位
            <input name="unit" required className="h-10 rounded border px-3" defaultValue="個" />
          </label>
          <label className="grid gap-1 text-sm">
            預設標籤
            <select name="defaultTagId" className="h-10 rounded border px-3 bg-background">
              <option value="">（無）</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="h-11 rounded bg-primary px-4 text-sm text-primary-foreground">
            儲存品項
          </button>
        </form>
      </section>

      <section className="rounded border p-4">
        <h2 className="text-lg font-medium">品項列表</h2>
        <form method="get" className="mt-3 flex gap-2" role="search">
          <input
            name="q"
            defaultValue={q}
            placeholder="搜尋品名"
            className="h-10 flex-1 rounded border px-3"
            data-testid="items-search-input"
          />
          <button type="submit" className="h-10 rounded border px-4 text-sm">
            搜尋
          </button>
        </form>

        <ul className="mt-4 space-y-4" data-testid="items-list">
          {items.length === 0 ? (
            <li className="rounded border border-dashed p-4 text-sm text-muted-foreground">沒有符合條件的品項。</li>
          ) : null}
          {items.map((item) => {
            const tagName = tags.find((t) => t.id === item.defaultTagIds[0])?.name ?? null;
            return (
              <li key={item.id} className="rounded border p-4" data-testid={`item-row-${item.name}`}>
                <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                  {tagName ? <span data-testid="item-tag-name">標籤：{tagName}</span> : null}
                </div>
                <form action={updateItemAction} className="grid gap-3">
                  <input type="hidden" name="itemId" value={item.id} />
                  <label className="grid gap-1 text-sm">
                    品名
                    <input name="name" required defaultValue={item.name} className="h-10 rounded border px-3" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    單位
                    <input name="unit" required defaultValue={item.unit} className="h-10 rounded border px-3" />
                  </label>
                  <label className="grid gap-1 text-sm">
                    預設標籤
                    <select
                      name="defaultTagId"
                      defaultValue={item.defaultTagIds[0] ?? ""}
                      className="h-10 rounded border px-3 bg-background"
                    >
                      <option value="">（無）</option>
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>{tag.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isDeleted" defaultChecked={item.isDeleted} />
                    封存（soft delete）
                  </label>
                  <button type="submit" className="h-10 rounded border px-4 text-sm">
                    更新品項
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export default function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<ItemsSearchParams>;
}) {
  return (
    <Suspense fallback={null}>
      <ItemsContent searchParams={searchParams} />
    </Suspense>
  );
}
