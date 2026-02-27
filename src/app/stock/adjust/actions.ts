"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { TransactionError } from "@/lib/transactions/errors";
import { adjustBatchQuantity } from "@/lib/transactions/service";
import { createClient } from "@/lib/supabase/server";

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

function redirectWithState(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  redirect(`/stock/adjust?${query.toString()}`);
}

export async function adjustBatchQuantityAction(formData: FormData) {
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
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/adjust");
  redirectWithState({ success: "adjusted" });
}
