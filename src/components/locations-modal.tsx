"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { StorageLocation } from "@/lib/storage-locations/service";
import { queryKeys } from "@/lib/query-keys";
import {
  createLocationModalAction,
  renameLocationModalAction,
} from "@/app/stock/locations/modal-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type LocationsModalProps = {
  open: boolean;
  locations: StorageLocation[];
  onClose: () => void;
  onSuccess: () => void;
};

export function LocationsModal({
  open,
  locations,
  onClose,
  onSuccess,
}: LocationsModalProps) {
  const queryClient = useQueryClient();
  const [localLocations, setLocalLocations] = useState<StorageLocation[]>(locations);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalLocations(locations);
  }, [locations]);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await createLocationModalAction(fd);
      if (result.ok) {
        form.reset();
        queryClient.invalidateQueries({ queryKey: queryKeys.locations });
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  function handleRename(locationId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("locationId", locationId);
    setError(null);
    startTransition(async () => {
      const result = await renameLocationModalAction(fd);
      if (result.ok) {
        setLocalLocations((prev) =>
          prev.map((loc) =>
            loc.id === locationId
              ? { ...loc, name: String(fd.get("name") ?? loc.name) }
              : loc,
          ),
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.locations });
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>存放點管理</DialogTitle>
        </DialogHeader>

        {error ? (
          <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
            錯誤：{error}
          </p>
        ) : null}

        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            name="name"
            required
            placeholder="新存放點名稱"
            className="h-9 flex-1 rounded border px-3 text-sm"
          />
          <button
            type="submit"
            disabled={isPending}
            className="h-9 rounded bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50"
          >
            新增
          </button>
        </form>

        {localLocations.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {localLocations.map((loc) => (
              <li key={loc.id}>
                <form
                  onSubmit={(e) => handleRename(loc.id, e)}
                  className="flex gap-2"
                >
                  <input
                    name="name"
                    required
                    defaultValue={loc.name}
                    className="h-9 flex-1 rounded border px-3 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="h-9 rounded border px-3 text-sm disabled:opacity-50"
                  >
                    儲存
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">尚無存放點</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
