"use server";

import { revalidatePath } from "next/cache";

import { TransactionError } from "@/lib/transactions/errors";
import { adjustBatchQuantity } from "@/lib/transactions/service";
import { createClient } from "@/lib/supabase/server";

export type ModalActionResult = { ok: true } | { ok: false; error: string };

function parseNonNegativeDecimal(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") return NaN;
  const trimmed = value.trim();
  if (trimmed.length === 0) return NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function adjustBatchQuantityModalAction(
  formData: FormData,
): Promise<ModalActionResult> {
  const supabase = await createClient();

  const batchId = parseOptionalString(formData.get("batchId")) ?? "";
  const actualQuantity = parseNonNegativeDecimal(formData.get("actualQuantity"));
  const note = parseOptionalString(formData.get("note"));
  const idempotencyKey = parseOptionalString(formData.get("idempotencyKey")) ?? "";

  try {
    await adjustBatchQuantity(supabase, {
      batchId,
      actualQuantity,
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
