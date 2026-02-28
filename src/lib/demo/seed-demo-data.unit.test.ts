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
  it("is idempotent: returns ok:true without seeding if items already exist", async () => {
    vi.mocked(listItems).mockResolvedValue([makeItem("水")]);

    const result = await seedDemoData(fakeSupabase());

    expect(result).toEqual({ ok: true });
    expect(createItem).not.toHaveBeenCalled();
    expect(createInboundBatch).not.toHaveBeenCalled();
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
