"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { PlanModeView } from "@/components/plan-mode-view";
import { RestockModeView } from "@/components/restock-mode-view";

import type { BatchWithRefs } from "@/lib/transactions/service";
import type { Item } from "@/lib/items/service";
import type { StorageLocation } from "@/lib/storage-locations/service";
import type { Tag } from "@/lib/tags/service";
import { queryKeys } from "@/lib/query-keys";
import { endMark } from "@/lib/perf";
import { StockSearch } from "@/components/stock-search";
import { HamburgerMenu } from "@/components/hamburger-menu";
import { PrintView } from "@/components/print-view";
import { InboundModal } from "@/components/inbound-modal";
import { ConsumeModal } from "@/components/consume-modal";
import { AdjustModal } from "@/components/adjust-modal";
import { LocationsModal } from "@/components/locations-modal";
import { TagsModal } from "@/components/tags-modal";

type StockMode = "consume" | "plan" | "restock";

function ModeTabs({ currentMode }: { currentMode: StockMode }) {
  const tabs: { mode: StockMode; label: string }[] = [
    { mode: "consume", label: "消耗" },
    { mode: "plan", label: "採買規劃" },
    { mode: "restock", label: "入庫盤點" },
  ];

  return (
    <div className="flex gap-0 border-b mb-4 sticky top-0 bg-background z-10">
      {tabs.map((tab) => (
        <Link
          key={tab.mode}
          href={`/stock?mode=${tab.mode}`}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            currentMode === tab.mode
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

type InboundTarget = {
  itemId: string;
  itemName: string;
  itemUnit: string;
};

type ItemGroup = {
  itemId: string;
  itemName: string;
  itemUnit: string;
  batches: BatchWithRefs[];
};

function groupBatches(batches: BatchWithRefs[]): ItemGroup[] {
  const map = new Map<string, ItemGroup>();
  for (const batch of batches) {
    const g = map.get(batch.itemId) ?? {
      itemId: batch.itemId,
      itemName: batch.itemName,
      itemUnit: batch.itemUnit,
      batches: [],
    };
    g.batches.push(batch);
    map.set(batch.itemId, g);
  }
  return [...map.values()];
}

type StockPageClientProps = {
  warehouseName: string;
};

export function StockPageClient({ warehouseName }: StockPageClientProps) {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? undefined;
  const rawMode = searchParams.get("mode");
  const mode: StockMode =
    rawMode === "plan" || rawMode === "restock" ? rawMode : "consume";
  const queryClient = useQueryClient();

  const { data: batches = [], isPending: batchesPending, isRefetching: isBatchesRefetching } = useQuery<BatchWithRefs[]>({
    queryKey: queryKeys.batches(q),
    queryFn: () =>
      fetch(`/api/stock/batches${q ? `?q=${encodeURIComponent(q)}` : ""}`)
        .then((r) => {
          if (!r.ok) throw new Error(r.statusText);
          return r.json();
        }),
  });
  const { data: locations = [] } = useQuery<StorageLocation[]>({
    queryKey: queryKeys.locations,
    queryFn: () =>
      fetch("/api/stock/locations").then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      }),
  });
  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: queryKeys.tags,
    queryFn: () =>
      fetch("/api/stock/tags").then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      }),
  });
  const { data: items = [] } = useQuery<Item[]>({
    queryKey: queryKeys.items,
    queryFn: () =>
      fetch("/api/stock/items").then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      }),
  });

  const [inboundTarget, setInboundTarget] = useState<InboundTarget | null>(null);
  const [consumeTarget, setConsumeTarget] = useState<BatchWithRefs | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<BatchWithRefs | null>(null);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  function handleSuccess(actionName?: string) {
    if (actionName) endMark(actionName);
    queryClient.invalidateQueries({ queryKey: ["stock", "batches"] });
  }

  const groups = groupBatches(batches);
  const hasItems = items.length > 0;
  const hasBatches = batches.length > 0;
  const isFiltered = Boolean(q?.trim());

  const groupedItemIds = new Set(groups.map((g) => g.itemId));
  const zeroStockItems = !isFiltered && !batchesPending
    ? items.filter((item) => !groupedItemIds.has(item.id) && !item.isDeleted)
    : [];

  return (
    <>
    <div className="mx-auto w-full max-w-xl p-4 md:p-6 print:hidden">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">庫存列表</h1>
          <p className="text-sm text-muted-foreground">倉庫：{warehouseName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => window.print()}
            className="inline-flex h-8 items-center rounded border px-3 text-xs"
          >
            列印
          </button>
          <HamburgerMenu
            onOpenLocations={() => setLocationsOpen(true)}
            onOpenTags={() => setTagsOpen(true)}
          />
        </div>
      </div>

      {/* Mode tabs */}
      <ModeTabs currentMode={mode} />

      {/* Consume mode */}
      {mode === "consume" && (
        <>
          {/* Sticky search */}
          <div className="sticky top-10 z-10 bg-background pb-3 pt-1">
            <StockSearch defaultQ={q} />
          </div>

          {!batchesPending && !hasBatches && !hasItems && (
            <div className="rounded border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">尚無庫存</p>
              <p className="mt-1 text-xs text-muted-foreground">請先建立品項，再進行入庫</p>
            </div>
          )}

          {!batchesPending && !hasBatches && isFiltered && (
            <div className="rounded border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                找不到符合「{q}」的批次
              </p>
            </div>
          )}

          {(hasBatches || zeroStockItems.length > 0) && (
            <ul className={`space-y-3 transition-opacity duration-200 ${isBatchesRefetching ? "opacity-60" : ""}`}>
              {groups.map((group) => (
                <li key={group.itemId} className="rounded border">
                  {/* Item header row */}
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <span className="font-medium">{group.itemName}</span>
                    <button
                      onClick={() =>
                        setInboundTarget({
                          itemId: group.itemId,
                          itemName: group.itemName,
                          itemUnit: group.itemUnit,
                        })
                      }
                      className="inline-flex h-7 items-center rounded bg-primary px-3 text-xs text-primary-foreground"
                    >
                      入庫
                    </button>
                  </div>

                  {/* Batch sub-rows */}
                  <ul>
                    {group.batches.map((batch) => {
                      const metaParts: string[] = [];
                      if (batch.expiryDate) metaParts.push(`到期：${batch.expiryDate}`);
                      if (batch.storageLocationName) metaParts.push(batch.storageLocationName);
                      if (batch.tagName) metaParts.push(batch.tagName);

                      return (
                        <li
                          key={batch.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 last:rounded-b"
                        >
                          <div>
                            <span className="text-lg font-semibold tabular-nums">
                              {batch.quantity}
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                {batch.itemUnit}
                              </span>
                            </span>
                            {metaParts.length > 0 ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {metaParts.join(" · ")}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => setConsumeTarget(batch)}
                              className="inline-flex h-7 items-center rounded border px-2 text-xs"
                            >
                              消耗
                            </button>
                            <button
                              onClick={() => setAdjustTarget(batch)}
                              className="inline-flex h-7 items-center rounded border px-2 text-xs"
                            >
                              盤點
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}

              {zeroStockItems.map((item) => (
                <li key={item.id} className="rounded border">
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="font-medium text-muted-foreground">{item.name}</span>
                    <button
                      onClick={() =>
                        setInboundTarget({
                          itemId: item.id,
                          itemName: item.name,
                          itemUnit: item.unit,
                        })
                      }
                      className="inline-flex h-7 items-center rounded bg-primary px-3 text-xs text-primary-foreground"
                    >
                      入庫
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <InboundModal
            open={!!inboundTarget}
            itemId={inboundTarget?.itemId ?? ""}
            itemName={inboundTarget?.itemName ?? ""}
            itemUnit={inboundTarget?.itemUnit ?? ""}
            locations={locations}
            tags={tags}
            onClose={() => setInboundTarget(null)}
            onSuccess={() => handleSuccess("inbound")}
          />

          <ConsumeModal
            open={!!consumeTarget}
            batch={consumeTarget}
            onClose={() => setConsumeTarget(null)}
            onSuccess={() => handleSuccess("consume")}
          />

          <AdjustModal
            open={!!adjustTarget}
            batch={adjustTarget}
            onClose={() => setAdjustTarget(null)}
            onSuccess={() => handleSuccess("adjust")}
          />
        </>
      )}

      {mode === "plan" && <PlanModeView />}

      {mode === "restock" && <RestockModeView />}

      <LocationsModal
        open={locationsOpen}
        locations={locations}
        onClose={() => setLocationsOpen(false)}
        onSuccess={handleSuccess}
      />

      <TagsModal
        open={tagsOpen}
        tags={tags}
        onClose={() => setTagsOpen(false)}
        onSuccess={handleSuccess}
      />

    </div>
    <PrintView batches={batches} warehouseName={warehouseName} />
    </>
  );
}
