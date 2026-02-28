/**
 * @deprecated UC-11: actions for the deprecated /stock/items page.
 * Do not add new functionality here. Will be removed in a future cleanup PR.
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ItemError } from "@/lib/items/errors";
import { createItem, updateItem } from "@/lib/items/service";
import { createClient } from "@/lib/supabase/server";

function parseOptionalStringList(
  formData: FormData,
  key: string,
  fallbackKey?: string,
): string[] | null {
  const entries = [...formData.getAll(key)];
  if (fallbackKey) {
    entries.push(...formData.getAll(fallbackKey));
  }

  const normalized = entries
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : null;
}

function redirectWithState(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  redirect(`/stock/items?${query.toString()}`);
}

export async function createItemAction(formData: FormData) {
  const supabase = await createClient();

  try {
    await createItem(supabase, {
      name: String(formData.get("name") ?? ""),
      unit: String(formData.get("unit") ?? ""),
      minStock: 0,
      defaultTagIds: parseOptionalStringList(
        formData,
        "defaultTagIds",
        "defaultTagId",
      ),
    });
  } catch (error) {
    if (error instanceof ItemError) {
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/items");
  redirectWithState({ success: "created" });
}

export async function updateItemAction(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) {
    redirectWithState({ error: "ITEM_NOT_FOUND" });
  }

  const supabase = await createClient();

  try {
    await updateItem(supabase, itemId, {
      name: String(formData.get("name") ?? ""),
      unit: String(formData.get("unit") ?? ""),
      defaultTagIds: parseOptionalStringList(
        formData,
        "defaultTagIds",
        "defaultTagId",
      ),
      isDeleted: formData.get("isDeleted") === "on",
    });
  } catch (error) {
    if (error instanceof ItemError) {
      redirectWithState({ error: error.code });
    }
    redirectWithState({ error: "FORBIDDEN" });
  }

  revalidatePath("/stock/items");
  redirectWithState({ success: "updated" });
}
