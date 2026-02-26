"use client";

import { useEffect, useState, useTransition } from "react";

import type { BatchWithRefs } from "@/lib/transactions/service";
import { adjustBatchQuantityModalAction } from "@/app/stock/adjust/modal-actions";
import { startMark } from "@/lib/perf";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AdjustModalProps = {
  open: boolean;
  batch: BatchWithRefs | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function AdjustModal({ open, batch, onClose, onSuccess }: AdjustModalProps) {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      setError(null);
    }
  }, [open]);

  if (!batch) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startMark("adjust");
    startTransition(async () => {
      const result = await adjustBatchQuantityModalAction(fd);
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>盤點：{batch.itemName}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          現有庫存：<span className="font-medium text-foreground">{batch.quantity} {batch.itemUnit}</span>
          {batch.expiryDate ? ` · 到期：${batch.expiryDate}` : ""}
        </p>

        {error ? (
          <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            錯誤：{error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="grid gap-3">
          <input type="hidden" name="batchId" value={batch.id} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

          <label className="grid gap-1 text-sm">
            實際數量（{batch.itemUnit}）
            <input
              name="actualQuantity"
              type="number"
              min={0}
              step="any"
              required
              defaultValue={batch.quantity}
              className="h-10 rounded border px-3"
            />
          </label>

          <button
            type="submit"
            disabled={isPending}
            className="h-10 rounded bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
          >
            {isPending ? "處理中…" : "確認盤點"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
