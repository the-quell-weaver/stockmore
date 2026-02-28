"use server";

import { revalidatePath } from "next/cache";

import { ItemError } from "@/lib/items/errors";
import { updateItem } from "@/lib/items/service";
import { createClient } from "@/lib/supabase/server";

export async function updateItemTargetQuantityAction(
  itemId: string,
  targetQuantity: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    await updateItem(supabase, itemId, { targetQuantity });
    revalidatePath("/stock");
    return { ok: true };
  } catch (e) {
    if (e instanceof ItemError) {
      return { ok: false, error: e.code };
    }
    return { ok: false, error: "UNKNOWN" };
  }
}
