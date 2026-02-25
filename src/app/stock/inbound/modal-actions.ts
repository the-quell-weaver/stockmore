"use server";

import { revalidatePath } from "next/cache";

import { TransactionError } from "@/lib/transactions/errors";
import {
  createInboundBatch,
  addInboundToBatch,
  listBatchesForItem,
  type Batch,
} from "@/lib/transactions/service";
import { createClient } from "@/lib/supabase/server";

export type ModalActionResult = { ok: true } | { ok: false; error: string };

function parsePositiveInt(value: FormDataEntryValue | null): number {
  const n = Number(typeof value === "string" ? value.trim() : "");
  return Number.isInteger(n) ? n : NaN;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function createInboundBatchModalAction(
  formData: FormData,
): Promise<ModalActionResult> {
  const supabase = await createClient();

  const itemId = parseOptionalString(formData.get("itemId")) ?? "";
  const quantity = parsePositiveInt(formData.get("quantity"));
  const expiryDate = parseOptionalString(formData.get("expiryDate"));
  const storageLocationId = parseOptionalString(formData.get("storageLocationId"));
  const tagId = parseOptionalString(formData.get("tagId"));
  const note = parseOptionalString(formData.get("note"));
  const idempotencyKey = parseOptionalString(formData.get("idempotencyKey"));

  try {
    await createInboundBatch(supabase, {
      itemId,
      quantity,
      expiryDate,
      storageLocationId,
      tagId,
      note,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof TransactionError) {
      return { ok: false, error: error.code };
    }
    return { ok: false, error: "FORBIDDEN" };
  }

  revalidatePath("/stock");
  return { ok: true };
}

export async function addInboundToBatchModalAction(
  formData: FormData,
): Promise<ModalActionResult> {
  const supabase = await createClient();

  const batchId = parseOptionalString(formData.get("batchId")) ?? "";
  const quantity = parsePositiveInt(formData.get("quantity"));
  const note = parseOptionalString(formData.get("note"));
  const idempotencyKey = parseOptionalString(formData.get("idempotencyKey"));

  try {
    await addInboundToBatch(supabase, {
      batchId,
      quantity,
      note,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof TransactionError) {
      return { ok: false, error: error.code };
    }
    return { ok: false, error: "FORBIDDEN" };
  }

  revalidatePath("/stock");
  return { ok: true };
}

export async function fetchBatchesForItemAction(itemId: string): Promise<Batch[]> {
  const supabase = await createClient();
  return listBatchesForItem(supabase, itemId);
}
