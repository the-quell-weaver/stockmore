import Link from "next/link";
import { Suspense } from "react";

import { createTagAction, renameTagAction } from "@/app/stock/tags/actions";
import { requireUser } from "@/lib/auth/require-user";
import { TAG_ERROR_CODES } from "@/lib/tags/errors";
import { listTags } from "@/lib/tags/service";
import { createClient } from "@/lib/supabase/server";

type TagsSearchParams = {
  error?: string;
  success?: string;
};

const errorMessageMap: Record<string, string> = {
  [TAG_ERROR_CODES.TAG_NAME_REQUIRED]: "標籤名稱為必填。",
  [TAG_ERROR_CODES.TAG_NAME_CONFLICT]: "此倉庫已存在相同名稱的標籤。",
  [TAG_ERROR_CODES.TAG_NOT_FOUND]: "找不到要改名的標籤。",
  [TAG_ERROR_CODES.FORBIDDEN]: "你沒有權限執行這個操作。",
};

const successMessageMap: Record<string, string> = {
  created: "已新增標籤。",
  renamed: "已更新標籤名稱。",
};

async function TagsContent({
  searchParams,
}: {
  searchParams: Promise<TagsSearchParams>;
}) {
  const supabase = await createClient();
  await requireUser(supabase, "/stock/tags");

  const params = await searchParams;
  const tags = await listTags(supabase);
  const errorMessage = params.error
    ? (errorMessageMap[params.error] ?? `操作失敗：${params.error}`)
    : null;
  const successMessage = params.success
    ? (successMessageMap[params.success] ?? `操作成功：${params.success}`)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6" data-testid="tags-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">標籤</h1>
          <p className="text-sm text-muted-foreground">管理倉庫中的標籤字典：新增與改名</p>
        </div>
        <Link href="/stock" className="text-sm underline">
          回到 Stock
        </Link>
      </div>

      {errorMessage ? (
        <p className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm" data-testid="tags-error">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="rounded border border-primary/20 bg-primary/10 p-3 text-sm" data-testid="tags-success">
          {successMessage}
        </p>
      ) : null}

      <section className="rounded border p-4">
        <h2 className="text-lg font-medium">新增標籤</h2>
        <form action={createTagAction} className="mt-3 grid gap-3" data-testid="create-tag-form">
          <label className="grid gap-1 text-sm">
            名稱
            <input name="name" required className="h-10 rounded border px-3" />
          </label>
          <button type="submit" className="h-11 rounded bg-primary px-4 text-sm text-primary-foreground">
            新增標籤
          </button>
        </form>
      </section>

      <section className="rounded border p-4">
        <h2 className="text-lg font-medium">標籤列表</h2>
        <ul className="mt-4 space-y-4" data-testid="tag-list">
          {tags.length === 0 ? (
            <li className="rounded border border-dashed p-4 text-sm text-muted-foreground">
              目前還沒有標籤。新增常用標籤（如：飲水、乾糧、醫療、工具）。
            </li>
          ) : null}
          {tags.map((tag) => (
            <li key={tag.id} className="rounded border p-4" data-testid="tag-item">
              <div className="mb-3 text-sm">
                目前名稱：<span className="font-medium">{tag.name}</span>
              </div>
              <form action={renameTagAction} className="grid gap-3" data-testid="rename-form">
                <input type="hidden" name="tagId" value={tag.id} />
                <label className="grid gap-1 text-sm">
                  新名稱
                  <input
                    name="name"
                    required
                    defaultValue={tag.name}
                    className="h-10 rounded border px-3"
                  />
                </label>
                <button type="submit" className="h-10 rounded border px-4 text-sm">
                  儲存改名
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function TagsPage({
  searchParams,
}: {
  searchParams: Promise<TagsSearchParams>;
}) {
  return (
    <Suspense fallback={null}>
      <TagsContent searchParams={searchParams} />
    </Suspense>
  );
}
