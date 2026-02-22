import Link from "next/link";
import { Suspense } from "react";

import {
  createLocationAction,
  renameLocationAction,
} from "@/app/stock/locations/actions";
import { requireUser } from "@/lib/auth/require-user";
import { LOCATION_ERROR_CODES } from "@/lib/storage-locations/errors";
import { listStorageLocations } from "@/lib/storage-locations/service";
import { createClient } from "@/lib/supabase/server";

type LocationsSearchParams = {
  error?: string;
  success?: string;
};

const errorMessageMap: Record<string, string> = {
  [LOCATION_ERROR_CODES.LOCATION_NAME_REQUIRED]: "存放點名稱為必填。",
  [LOCATION_ERROR_CODES.LOCATION_NAME_CONFLICT]: "同一倉庫已存在相同名稱的存放點。",
  [LOCATION_ERROR_CODES.LOCATION_NOT_FOUND]: "找不到要改名的存放點。",
  [LOCATION_ERROR_CODES.FORBIDDEN]: "你沒有權限執行這個操作。",
};

const successMessageMap: Record<string, string> = {
  created: "已新增存放點。",
  renamed: "已更新存放點名稱。",
};

async function LocationsContent({
  searchParams,
}: {
  searchParams: Promise<LocationsSearchParams>;
}) {
  const supabase = await createClient();
  await requireUser(supabase, "/stock/locations");

  const params = await searchParams;
  const locations = await listStorageLocations(supabase);
  const errorMessage = params.error
    ? (errorMessageMap[params.error] ?? `操作失敗：${params.error}`)
    : null;
  const successMessage = params.success
    ? (successMessageMap[params.success] ?? `操作成功：${params.success}`)
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6" data-testid="locations-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">存放點</h1>
          <p className="text-sm text-muted-foreground">管理倉庫中的存放點字典：新增與改名</p>
        </div>
        <Link href="/stock" className="text-sm underline">
          回到 Stock
        </Link>
      </div>

      {errorMessage ? (
        <p className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm" data-testid="locations-error">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="rounded border border-primary/20 bg-primary/10 p-3 text-sm" data-testid="locations-success">
          {successMessage}
        </p>
      ) : null}

      <section className="rounded border p-4">
        <h2 className="text-lg font-medium">新增存放點</h2>
        <form action={createLocationAction} className="mt-3 grid gap-3" data-testid="create-location-form">
          <label className="grid gap-1 text-sm">
            名稱
            <input name="name" required className="h-10 rounded border px-3" />
          </label>
          <button type="submit" className="h-11 rounded bg-primary px-4 text-sm text-primary-foreground">
            新增存放點
          </button>
        </form>
      </section>

      <section className="rounded border p-4">
        <h2 className="text-lg font-medium">存放點列表</h2>
        <ul className="mt-4 space-y-4" data-testid="location-list">
          {locations.length === 0 ? (
            <li className="rounded border border-dashed p-4 text-sm text-muted-foreground">
              目前還沒有存放點。新增常用存放點（如：客廳櫃子、玄關、床下）。
            </li>
          ) : null}
          {locations.map((location) => (
            <li key={location.id} className="rounded border p-4" data-testid="location-item">
              <div className="mb-3 text-sm">
                目前名稱：<span className="font-medium">{location.name}</span>
              </div>
              <form action={renameLocationAction} className="grid gap-3" data-testid="rename-form">
                <input type="hidden" name="locationId" value={location.id} />
                <label className="grid gap-1 text-sm">
                  新名稱
                  <input
                    name="name"
                    required
                    defaultValue={location.name}
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

export default function StorageLocationsPage({
  searchParams,
}: {
  searchParams: Promise<LocationsSearchParams>;
}) {
  return (
    <Suspense fallback={null}>
      <LocationsContent searchParams={searchParams} />
    </Suspense>
  );
}
