"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { BatchWithRefs, ItemWithBatches } from "@/lib/transactions/service";
import type { StorageLocation } from "@/lib/storage-locations/service";
import type { Tag } from "@/lib/tags/service";
import { queryKeys } from "@/lib/query-keys";
import { InboundModal } from "@/components/inbound-modal";
import { AdjustModal } from "@/components/adjust-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InboundTarget = {
  itemId: string;
  itemName: string;
  itemUnit: string;
};

export function RestockModeView() {
  const [q, setQ] = useState("");
  const [inboundTarget, setInboundTarget] = useState<InboundTarget | null>(null);
  const [adjustBatch, setAdjustBatch] = useState<BatchWithRefs | null>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<ItemWithBatches[]>({
    queryKey: queryKeys.itemsWithBatches(q),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/stock/items-with-batches?${params}`);
      if (!res.ok) throw new Error("Failed to load items");
      return res.json();
    },
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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["stock", "itemsWithBatches"] });

  return (
    <div className="space-y-4">
      <Input
        placeholder="搜尋品項…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-xs"
      />

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">尚無品項。</p>
      )}

      <div className="divide-y">
        {items.map((item) => (
          <div key={item.id} className="py-3">
            {/* Item header row */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium">{item.name}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setInboundTarget({
                    itemId: item.id,
                    itemName: item.name,
                    itemUnit: item.unit,
                  })
                }
              >
                + 入庫
              </Button>
            </div>

            {/* No batches state */}
            {item.batches.length === 0 && (
              <p className="text-xs text-muted-foreground pl-2">尚無批次</p>
            )}

            {/* Batch rows */}
            {item.batches.map((batch) => (
              <div
                key={batch.id}
                className="pl-3 py-1 flex items-center justify-between gap-2 text-sm border-l ml-1 flex-wrap"
              >
                <div className="flex gap-3 items-center text-muted-foreground flex-wrap">
                  <span className="tabular-nums font-medium text-foreground">
                    {batch.quantity} {item.unit}
                  </span>
                  {batch.expiryDate && (
                    <Badge variant="outline" className="text-xs">
                      到期 {batch.expiryDate}
                    </Badge>
                  )}
                  {batch.storageLocationName && (
                    <span>{batch.storageLocationName}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAdjustBatch(batch)}
                  >
                    盤點
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setInboundTarget({
                        itemId: item.id,
                        itemName: item.name,
                        itemUnit: item.unit,
                      })
                    }
                  >
                    入庫
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {inboundTarget && (
        <InboundModal
          open={!!inboundTarget}
          itemId={inboundTarget.itemId}
          itemName={inboundTarget.itemName}
          itemUnit={inboundTarget.itemUnit}
          locations={locations}
          tags={tags}
          onClose={() => setInboundTarget(null)}
          onSuccess={() => {
            setInboundTarget(null);
            void invalidate();
          }}
        />
      )}

      {adjustBatch && (
        <AdjustModal
          open={!!adjustBatch}
          batch={adjustBatch}
          onClose={() => setAdjustBatch(null)}
          onSuccess={() => {
            setAdjustBatch(null);
            void invalidate();
          }}
        />
      )}
    </div>
  );
}
