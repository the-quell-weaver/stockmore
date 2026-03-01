import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEED_BATCHES, SEED_ITEMS } from "./seed-fixture";

vi.mock("@/lib/items/service", () => ({
  listItems: vi.fn(),
  createItem: vi.fn(),
}));
vi.mock("@/lib/transactions/service", () => ({
  createInboundBatch: vi.fn(),
}));

import { createItem, listItems } from "@/lib/items/service";
import { createInboundBatch } from "@/lib/transactions/service";
import { seedDemoData } from "./seed-demo-data";

const fakeSupabase = () => ({} as unknown as SupabaseClient);

const makeItem = (name: string) => ({
  id: `id-${name}`,
  orgId: "org-1",
  name,
  unit: "個",
  minStock: 0,
  defaultTagIds: [],
  note: null,
  isDeleted: false,
  targetQuantity: null,
  createdAt: "",
  updatedAt: "",
});

afterEach(() => vi.clearAllMocks());

describe("seedDemoData", () => {
  it("is idempotent: returns ok:true without re-seeding when all seed items exist", async () => {
    vi.mocked(listItems).mockResolvedValue(
      SEED_ITEMS.map((si) => makeItem(si.name)),
    );

    const result = await seedDemoData(fakeSupabase());

    expect(result).toEqual({ ok: true });
    expect(createItem).not.toHaveBeenCalled();
    expect(createInboundBatch).not.toHaveBeenCalled();
  });

  it("resumes partial seed: creates only missing items and their batches", async () => {
    // Simulate a prior run that created the first two items but then failed.
    const preExisting = SEED_ITEMS.slice(0, 2).map((si) => makeItem(si.name));
    vi.mocked(listItems).mockResolvedValue(preExisting);
    vi.mocked(createItem).mockImplementation(async (_, input) =>
      makeItem(input.name),
    );
    vi.mocked(createInboundBatch).mockResolvedValue({
      batchId: "b-1",
      transactionId: "tx-1",
      batchQuantity: 10,
    });

    const result = await seedDemoData(fakeSupabase());

    expect(result).toEqual({ ok: true });
    // Only the remaining items are created
    expect(createItem).toHaveBeenCalledTimes(SEED_ITEMS.length - 2);
    // Batches are created only for newly created items
    const newRefs = new Set(SEED_ITEMS.slice(2).map((si) => si.ref));
    const expectedBatches = SEED_BATCHES.filter((b) => newRefs.has(b.itemRef));
    expect(createInboundBatch).toHaveBeenCalledTimes(expectedBatches.length);
  });

  it("creates all items and batches from fixture when org is empty", async () => {
    vi.mocked(listItems).mockResolvedValue([]);
    vi.mocked(createItem).mockImplementation(async (_, input) =>
      makeItem(input.name),
    );
    vi.mocked(createInboundBatch).mockResolvedValue({
      batchId: "b-1",
      transactionId: "tx-1",
      batchQuantity: 10,
    });

    const result = await seedDemoData(fakeSupabase());

    expect(result).toEqual({ ok: true });
    expect(createItem).toHaveBeenCalledTimes(SEED_ITEMS.length);
    expect(createInboundBatch).toHaveBeenCalledTimes(SEED_BATCHES.length);
  });

  it("returns { ok: false, error: SEED_FAILED } if createItem throws", async () => {
    vi.mocked(listItems).mockResolvedValue([]);
    vi.mocked(createItem).mockRejectedValue(new Error("DB error"));

    const result = await seedDemoData(fakeSupabase());

    expect(result).toEqual({ ok: false, error: "SEED_FAILED" });
  });

  it("returns { ok: false, error: SEED_FAILED } if createInboundBatch throws", async () => {
    vi.mocked(listItems).mockResolvedValue([]);
    vi.mocked(createItem).mockImplementation(async (_, input) =>
      makeItem(input.name),
    );
    vi.mocked(createInboundBatch).mockRejectedValue(new Error("Batch error"));

    const result = await seedDemoData(fakeSupabase());

    expect(result).toEqual({ ok: false, error: "SEED_FAILED" });
  });
});
