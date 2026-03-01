import type { SupabaseClient } from "@supabase/supabase-js";
import { createItem, listItems } from "@/lib/items/service";
import { createInboundBatch } from "@/lib/transactions/service";
import { DEMO_ERROR_CODES } from "./errors";
import { SEED_BATCHES, SEED_ITEMS } from "./seed-fixture";

export type SeedResult = { ok: true } | { ok: false; error: string };

export async function seedDemoData(supabase: SupabaseClient): Promise<SeedResult> {
  try {
    const existing = await listItems(supabase);

    // AC6 / R2: All seed items are present — org is fully seeded; skip.
    // Using SEED_ITEMS.length (not > 0) so a partial-item failure (fewer items
    // than expected) is still retried rather than silently treated as done.
    if (existing.length >= SEED_ITEMS.length) {
      return { ok: true };
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

    // Create batches only for items that were newly created in this run.
    // Pre-existing items keep whatever batches they already have.
    const newRefs = new Set(
      SEED_ITEMS.filter((si) => !existingByName.has(si.name)).map((si) => si.ref),
    );
    for (const batch of SEED_BATCHES) {
      if (!newRefs.has(batch.itemRef)) continue;
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
