"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { PlanModeItem } from "@/lib/transactions/service";
import type { StorageLocation } from "@/lib/storage-locations/service";
import type { Tag } from "@/lib/tags/service";
import { queryKeys } from "@/lib/query-keys";
import { updateItemTargetQuantityAction } from "@/app/stock/plan-mode-actions";
import { InboundModal } from "@/components/inbound-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PlanModeView() {
  const [q, setQ] = useState("");
  const [excludeExpired, setExcludeExpired] = useState(true);
  const [inboundItemId, setInboundItemId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<PlanModeItem[]>({
    queryKey: queryKeys.planModeItems(q, excludeExpired),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("excludeExpired", String(excludeExpired));
      const res = await fetch(`/api/stock/plan-items?${params}`);
      if (!res.ok) throw new Error("Failed to load plan items");
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

  async function handleTargetChange(itemId: string, raw: string) {
    const val = raw === "" ? null : Number(raw);
    if (val !== null && (isNaN(val) || val <= 0)) return;
    const result = await updateItemTargetQuantityAction(itemId, val);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["stock", "planModeItems"] });
    }
  }

  const inboundItem = items.find((i) => i.id === inboundItemId);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-2 flex-wrap items-center">
        <Input
          placeholder="搜尋品項…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant={excludeExpired ? "default" : "outline"}
          size="sm"
          onClick={() => setExcludeExpired((v) => !v)}
        >
          {excludeExpired ? "不含過期" : "含過期"}
        </Button>
      </div>

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">
          尚無品項設定目標數量。請在品項編輯頁設定「目標數量」以加入採買規劃。
        </p>
      )}

      {/* Items list */}
      <div className="divide-y">
        {items.map((item) => (
          <div key={item.id} className="py-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">{item.name}</span>
              <div className="flex items-center gap-2">
                {item.completionPct >= 100 ? (
                  <Badge variant="secondary">已達標</Badge>
                ) : (
                  <Badge variant="outline">缺 {item.deficit} {item.unit}</Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInboundItemId(item.id)}
                >
                  入庫
                </Button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${item.completionPct}%` }}
              />
            </div>

            {/* Quantities row */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span>現有 {item.currentStock} {item.unit}</span>
              <span className="flex items-center gap-1">
                <Label className="text-xs">目標</Label>
                <input
                  type="number"
                  min="1"
                  defaultValue={item.targetQuantity}
                  className="w-16 text-right border rounded px-1 py-0.5 text-sm"
                  onBlur={(e) => handleTargetChange(item.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                />
                <span>{item.unit}</span>
              </span>
              <span>{Math.round(item.completionPct)}%</span>
            </div>

            {item.note && (
              <p className="text-xs text-muted-foreground">{item.note}</p>
            )}
          </div>
        ))}
      </div>

      {/* Inbound modal */}
      {inboundItem && (
        <InboundModal
          open={!!inboundItemId}
          itemId={inboundItem.id}
          itemName={inboundItem.name}
          itemUnit={inboundItem.unit}
          locations={locations}
          tags={tags}
          onClose={() => setInboundItemId(null)}
          onSuccess={() => {
            setInboundItemId(null);
            void queryClient.invalidateQueries({
              queryKey: ["stock", "planModeItems"],
            });
          }}
        />
      )}
    </div>
  );
}
