"use client";

import { useEffect, useState, useTransition } from "react";

import type { Batch } from "@/lib/transactions/service";
import type { StorageLocation } from "@/lib/storage-locations/service";
import type { Tag } from "@/lib/tags/service";
import {
  createInboundBatchModalAction,
  addInboundToBatchModalAction,
  fetchBatchesForItemAction,
} from "@/app/stock/inbound/modal-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type InboundModalProps = {
  open: boolean;
  itemId: string;
  itemName: string;
  itemUnit: string;
  locations: StorageLocation[];
  tags: Tag[];
  onClose: () => void;
  onSuccess: () => void;
};

export function InboundModal({
  open,
  itemId,
  itemName,
  itemUnit,
  locations,
  tags,
  onClose,
  onSuccess,
}: InboundModalProps) {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [existingBatches, setExistingBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      setError(null);
      setExistingBatches([]);
    }
  }, [open]);

  function handleTabChange(value: string) {
    if (value === "existing" && existingBatches.length === 0) {
      setLoadingBatches(true);
      fetchBatchesForItemAction(itemId)
        .then(setExistingBatches)
        .finally(() => setLoadingBatches(false));
    }
  }

  function handleCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createInboundBatchModalAction(fd);
      if (result.ok) {
        onSuccess();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  function handleAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await addInboundToBatchModalAction(fd);
      if (result.ok) {
        onSuccess();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>入庫：{itemName}</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            錯誤：{error}
          </p>
        ) : null}

        <Tabs defaultValue="new" onValueChange={handleTabChange}>
          <TabsList className="w-full">
            <TabsTrigger value="new" className="flex-1">建立新批次</TabsTrigger>
            <TabsTrigger value="existing" className="flex-1">加入既有批次</TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            <form onSubmit={handleCreateSubmit} className="mt-3 grid gap-3">
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

              <label className="grid gap-1 text-sm">
                數量（{itemUnit}）
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  step={1}
                  required
                  className="h-10 rounded border px-3"
                />
              </label>

              <label className="grid gap-1 text-sm">
                到期日（可選）
                <input name="expiryDate" type="date" className="h-10 rounded border px-3" />
              </label>

              {locations.length > 0 ? (
                <label className="grid gap-1 text-sm">
                  存放點（可選）
                  <select
                    name="storageLocationId"
                    className="h-10 rounded border px-3 bg-background"
                  >
                    <option value="">（無）</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {tags.length > 0 ? (
                <label className="grid gap-1 text-sm">
                  標籤（可選）
                  <select
                    name="tagId"
                    className="h-10 rounded border px-3 bg-background"
                  >
                    <option value="">（無）</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <button
                type="submit"
                disabled={isPending}
                className="h-10 rounded bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
              >
                {isPending ? "處理中…" : "建立批次"}
              </button>
            </form>
          </TabsContent>

          <TabsContent value="existing">
            {loadingBatches ? (
              <p className="mt-4 text-sm text-muted-foreground">載入中…</p>
            ) : existingBatches.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">尚無既有批次</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {existingBatches.map((batch) => (
                  <li key={batch.id} className="rounded border p-3">
                    <p className="text-sm">
                      現有庫存：<span className="font-medium">{batch.quantity} {itemUnit}</span>
                      {batch.expiryDate ? ` · 到期：${batch.expiryDate}` : ""}
                    </p>
                    <form onSubmit={handleAddSubmit} className="mt-2 flex gap-2">
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
                      <input
                        name="quantity"
                        type="number"
                        min={1}
                        step={1}
                        required
                        placeholder={`數量（${itemUnit}）`}
                        className="h-9 flex-1 rounded border px-3 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={isPending}
                        className="h-9 rounded bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
                      >
                        {isPending ? "…" : "加入"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
