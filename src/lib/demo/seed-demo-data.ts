import type { SupabaseClient } from "@supabase/supabase-js";
import { createItem, listItems } from "@/lib/items/service";
import { createInboundBatch } from "@/lib/transactions/service";
import { DEMO_ERROR_CODES } from "./errors";
import { SEED_BATCHES, SEED_ITEMS } from "./seed-fixture";

export type SeedResult = { ok: true } | { ok: false; error: string };

export async function seedDemoData(supabase: SupabaseClient): Promise<SeedResult> {
  try {
    // AC6 / R2: idempotency — skip if org already has items
    const existing = await listItems(supabase);
    if (existing.length > 0) {
      return { ok: true };
    }

    // Create items, build ref → id map for batch creation
    const itemIdByRef = new Map<string, string>();
    for (const seedItem of SEED_ITEMS) {
      const created = await createItem(supabase, {
        name: seedItem.name,
        unit: seedItem.unit,
        minStock: seedItem.minStock,
        note: seedItem.note,
      });
      itemIdByRef.set(seedItem.ref, created.id);
    }

    // Create batches
    for (const batch of SEED_BATCHES) {
      const itemId = itemIdByRef.get(batch.itemRef);
      if (!itemId) throw new Error(`Fixture error: no item found for itemRef "${batch.itemRef}"`);
      await createInboundBatch(supabase, {
        itemId,
        quantity: batch.quantity,
        expiryDate: batch.expiryDate ?? null,
      });
    }

    return { ok: true };
  } catch {
    return { ok: false, error: DEMO_ERROR_CODES.SEED_FAILED };
  }
}
