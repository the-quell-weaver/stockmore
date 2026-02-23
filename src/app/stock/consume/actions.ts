"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { TransactionError } from "@/lib/transactions/errors";
import { consumeFromBatch } from "@/lib/transactions/service";
import { createClient } from "@/lib/supabase/server";

function parsePositiveDecimal(value: FormDataEntryValue | null): number {
  const n = Number(typeof value === "string" ? value.trim() : "");
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function redirectWithState(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  redirect(`/stock/consume?${query.toString()}`);
}

export async function consumeFromBatchAction(formData: FormData) {
  const supabase = await createClient();

  const batchId = parseOptionalString(formData.get("batchId")) ?? "";
  const quantity = parsePositiveDecimal(formData.get("quantity"));
  const note = parseOptionalString(formData.get("note"));
  const idempotencyKey = parseOptionalString(formData.get("idempotencyKey"));

  try {
    await consumeFromBatch(supabase, {
      batchId,
      quantity,
      note,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof TransactionError) {
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/consume");
  redirectWithState({ success: "consumed" });
}
