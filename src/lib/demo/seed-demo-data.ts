import type { SupabaseClient } from "@supabase/supabase-js";
import { createItem, listItems } from "@/lib/items/service";
import { createInboundBatch, listStockBatches } from "@/lib/transactions/service";
import { DEMO_ERROR_CODES } from "./errors";
import { SEED_BATCHES, SEED_ITEMS } from "./seed-fixture";

export type SeedResult = { ok: true } | { ok: false; error: string };

export async function seedDemoData(supabase: SupabaseClient): Promise<SeedResult> {
  try {
    const existing = await listItems(supabase);

    // AC6 / R2: fully seeded check — all items AND all expected batches present.
    // Checking both counts prevents a partial-batch failure (all items created,
    // some batches not) from being silently treated as done.
    if (existing.length >= SEED_ITEMS.length) {
      const batches = await listStockBatches(supabase, { limit: SEED_BATCHES.length + 1 });
      if (batches.length >= SEED_BATCHES.length) {
        return { ok: true };
      }
    }

    // Build ref → id map, reusing any items already created in a prior partial
    // run (matched by name) to avoid ITEM_NAME_CONFLICT on retry.
    const existingByName = new Map(existing.map((i) => [i.name, i.id]));
    const itemIdByRef = new Map<string, string>();
    for (const seedItem of SEED_ITEMS) {
      const existingId = existingByName.get(seedItem.name);
      if (existingId) {
        itemIdByRef.set(seedItem.ref, existingId);
        continue;
      }
      const created = await createItem(supabase, {
        name: seedItem.name,
        unit: seedItem.unit,
        minStock: seedItem.minStock,
        note: seedItem.note,
      });
      itemIdByRef.set(seedItem.ref, created.id);
    }

    // Create batches for all seed items. When recovering from a partial-batch
    // failure (all items exist but some batches are missing), we create batches
    // for every item including pre-existing ones. Some items may end up with
    // extra stock, which is acceptable for a demo org.
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
  } catch (err) {
    console.error("[seedDemoData] failed:", err);
    return { ok: false, error: DEMO_ERROR_CODES.SEED_FAILED };
  }
}
