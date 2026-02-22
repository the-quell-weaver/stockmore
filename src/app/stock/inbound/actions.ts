"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { TransactionError } from "@/lib/transactions/errors";
import {
  createInboundBatch,
  addInboundToBatch,
} from "@/lib/transactions/service";
import { createClient } from "@/lib/supabase/server";

function parsePositiveInt(value: FormDataEntryValue | null): number {
  const n = Number(typeof value === "string" ? value.trim() : "");
  return Number.isInteger(n) ? n : NaN;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function redirectWithState(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  redirect(`/stock/inbound?${query.toString()}`);
}

export async function createInboundBatchAction(formData: FormData) {
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
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/inbound");
  redirectWithState({ success: "inbound_created" });
}

export async function addInboundToBatchAction(formData: FormData) {
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
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/inbound");
  redirectWithState({ success: "inbound_added" });
}
