"use client";

import { useEffect, useState, useTransition } from "react";

import type { Tag } from "@/lib/tags/service";
import {
  createTagModalAction,
  renameTagModalAction,
} from "@/app/stock/tags/modal-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TagsModalProps = {
  open: boolean;
  tags: Tag[];
  onClose: () => void;
  onSuccess: () => void;
};

export function TagsModal({ open, tags, onClose, onSuccess }: TagsModalProps) {
  const [localTags, setLocalTags] = useState<Tag[]>(tags);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await createTagModalAction(fd);
      if (result.ok) {
        form.reset();
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  function handleRename(tagId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("tagId", tagId);
    setError(null);
    startTransition(async () => {
      const result = await renameTagModalAction(fd);
      if (result.ok) {
        setLocalTags((prev) =>
          prev.map((tag) =>
            tag.id === tagId
              ? { ...tag, name: String(fd.get("name") ?? tag.name) }
              : tag,
          ),
        );
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
          <DialogTitle>標籤管理</DialogTitle>
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
            placeholder="新標籤名稱"
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

        {localTags.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {localTags.map((tag) => (
              <li key={tag.id}>
                <form
                  onSubmit={(e) => handleRename(tag.id, e)}
                  className="flex gap-2"
                >
                  <input
                    name="name"
                    required
                    defaultValue={tag.name}
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
          <p className="text-sm text-muted-foreground">尚無標籤</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
