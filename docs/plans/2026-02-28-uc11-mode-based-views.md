# UC-11 Mode-Based Stock Views Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-view `/stock` page with three mode-based views (plan/consume/restock) controlled by `?mode=` query param, and add `target_quantity` per item for purchase planning.

**Architecture:** New `target_quantity numeric` column on `items`. Three view modes rendered by `stock-page-client.tsx` (reads `?mode=` via `useSearchParams`). Two new service functions in `transactions/service.ts` for aggregated plan data and all-items-with-batches. One new service function in `items/service.ts` for updating `target_quantity`. New API routes + server action back the client queries. `/stock/items` route marked deprecated and removed from nav.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres + RLS, TanStack React Query, shadcn/ui (existing: tabs, button, badge, input, label), Vitest (integration), Playwright (e2e).

---

## Task 1: DB Migration — `items.target_quantity`

**Files:**
- Create: `supabase/migrations/20260229000002_uc11_target_quantity.sql`

**Step 1: Determine next migration filename**

```bash
ls supabase/migrations/ | tail -3
```
Expected output shows last file is `20260229000001_transactions_type_check.sql`. Next = `20260229000002`.

**Step 2: Create migration**

```sql
-- supabase/migrations/20260229000002_uc11_target_quantity.sql

-- Add target_quantity to items for UC-11 purchase planning mode.
-- NULL = item not on purchase plan. Must be > 0 when set (enforced at app layer).
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS target_quantity numeric;

COMMENT ON COLUMN items.target_quantity IS
  'UC-11: target stock quantity for purchase planning. NULL = not on plan.';
```

**Step 3: Apply migration locally**

```bash
cd /mnt/e/Alex/works/quell-weaver/stockmore
supabase db reset
```
Expected: migration runs without errors, `items` table now has `target_quantity` column.

**Step 4: Verify column exists**

```bash
supabase db diff --schema public 2>/dev/null | grep target_quantity
```
Or just confirm `db reset` printed no errors.

**Step 5: Commit**

```bash
git add supabase/migrations/20260229000002_uc11_target_quantity.sql
git commit -m "feat(uc11): add items.target_quantity migration"
```

---

## Task 2: Extend Item type + validation + error code

**Files:**
- Modify: `src/lib/items/errors.ts`
- Modify: `src/lib/items/validation.ts`
- Modify: `src/lib/items/service.ts`
- Test: `src/lib/items/validation.unit.test.ts` (create if not exists)

**Step 1: Add error code to `src/lib/items/errors.ts`**

Find the `ITEM_ERROR_CODES` object and add one entry:

```ts
TARGET_QUANTITY_INVALID: "TARGET_QUANTITY_INVALID",
```

**Step 2: Write failing unit test for `validateTargetQuantity`**

Create `src/lib/items/validation.unit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateTargetQuantity } from "@/lib/items/validation";

describe("validateTargetQuantity", () => {
  it("accepts null (remove from plan)", () => {
    expect(validateTargetQuantity(null)).toBeNull();
  });

  it("accepts positive integer", () => {
    expect(validateTargetQuantity(10)).toBe(10);
  });

  it("accepts positive decimal", () => {
    expect(validateTargetQuantity(2.5)).toBe(2.5);
  });

  it("rejects zero", () => {
    expect(() => validateTargetQuantity(0)).toThrow("TARGET_QUANTITY_INVALID");
  });

  it("rejects negative", () => {
    expect(() => validateTargetQuantity(-1)).toThrow("TARGET_QUANTITY_INVALID");
  });

  it("rejects NaN", () => {
    expect(() => validateTargetQuantity(NaN)).toThrow("TARGET_QUANTITY_INVALID");
  });
});
```

**Step 3: Run test — expect FAIL**

```bash
cd src && npm run test:unit -- validation.unit.test
```
Expected: FAIL — `validateTargetQuantity` not found.

**Step 4: Add `validateTargetQuantity` + extend types in `src/lib/items/validation.ts`**

Add `targetQuantity?: number | null` to `UpdateItemInput`:

```ts
export type UpdateItemInput = {
  name?: string;
  unit?: string;
  minStock?: number;
  defaultTagIds?: string[] | null;
  note?: string | null;
  isDeleted?: boolean;
  targetQuantity?: number | null;  // UC-11
};
```

Add the validator function at the bottom of the file:

```ts
export function validateTargetQuantity(raw: number | null): number | null {
  if (raw === null) return null;
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new ItemError(ITEM_ERROR_CODES.TARGET_QUANTITY_INVALID);
  }
  return raw;
}
```

Add `targetQuantity` handling to `validateUpdateItemInput`:

```ts
if (input.targetQuantity !== undefined) {
  patch.targetQuantity = validateTargetQuantity(input.targetQuantity);
}
```

**Step 5: Run test — expect PASS**

```bash
cd src && npm run test:unit -- validation.unit.test
```
Expected: PASS (6 tests).

**Step 6: Extend `Item` type and `mapItemRow` in `src/lib/items/service.ts`**

Add `target_quantity` to `ItemRow`:

```ts
type ItemRow = {
  // ... existing fields ...
  target_quantity: number | string | null;  // UC-11
};
```

Add `targetQuantity` to the `Item` export type:

```ts
export type Item = {
  // ... existing fields ...
  /** @deprecated use targetQuantity for purchase planning instead */
  minStock: number;
  targetQuantity: number | null;  // UC-11
};
```

Update all SELECT queries in `listItems`, `createItem`, `updateItem` — append `, target_quantity` to each `.select(...)` string.

Update `mapItemRow`:

```ts
function mapItemRow(row: ItemRow): Item {
  return {
    // ... existing fields ...
    targetQuantity: row.target_quantity != null ? Number(row.target_quantity) : null,
  };
}
```

Update `updateItem` payload block — add after the `note` branch:

```ts
if (validated.targetQuantity !== undefined) {
  payload.target_quantity = validated.targetQuantity;
}
```

**Step 7: Run typecheck + unit tests, then commit**

```bash
cd src && npm run typecheck && npm run test:unit
```
Expected: no type errors, all unit tests pass.

```bash
git add src/lib/items/errors.ts src/lib/items/validation.ts \
        src/lib/items/service.ts src/lib/items/validation.unit.test.ts
git commit -m "feat(uc11): add targetQuantity to Item type, validation, and service"
```

---

## Task 3: `updateItemTargetQuantity` service + integration test

**Files:**
- Modify: `src/lib/items/service.ts`
- Create: `src/tests/integration/items/target-quantity.integration.test.ts`

**Step 1: Write failing integration test**

```ts
// src/tests/integration/items/target-quantity.integration.test.ts
// (copy the top boilerplate — loadEnvFiles, createTestUser, cleanupTestUser, signIn,
//  bootstrap, seedItem helpers — from items.integration.test.ts)
import { updateItem } from "@/lib/items/service";

describe("updateItemTargetQuantity (UC-11)", () => {
  it("sets target_quantity for an item", async () => {
    const user = await createTestUser("tq");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const updated = await updateItem(asServiceClient(client), itemId, {
        targetQuantity: 20,
      });
      expect(updated.targetQuantity).toBe(20);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("removes target_quantity by setting null", async () => {
    const user = await createTestUser("tq");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      await updateItem(asServiceClient(client), itemId, { targetQuantity: 10 });
      const cleared = await updateItem(asServiceClient(client), itemId, {
        targetQuantity: null,
      });
      expect(cleared.targetQuantity).toBeNull();
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("rejects target_quantity <= 0", async () => {
    const user = await createTestUser("tq");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      await expect(
        updateItem(asServiceClient(client), itemId, { targetQuantity: 0 })
      ).rejects.toThrow("TARGET_QUANTITY_INVALID");
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("viewer cannot set target_quantity (FORBIDDEN)", async () => {
    const user = await createTestUser("tq");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      await client.from("org_memberships")
        .update({ role: "viewer" })
        .eq("org_id", org.org_id)
        .eq("user_id", user.userId);

      await expect(
        updateItem(asServiceClient(client), itemId, { targetQuantity: 5 })
      ).rejects.toThrow("FORBIDDEN");
    } finally {
      await cleanupTestUser(user.userId);
    }
  });
});
```

**Step 2: Run integration test — expect FAIL**

```bash
cd src && npm run test:integration -- target-quantity.integration
```
Expected: FAIL — `updateItem` does not yet write `target_quantity` (Task 2 Step 6 should have added this — if Task 2 is done, this should already pass; if not, complete Task 2 first).

**Step 3: Run integration test — expect PASS**

After Task 2 is complete, rerun:

```bash
cd src && npm run test:integration -- target-quantity.integration
```
Expected: PASS (4 tests).

**Step 4: Commit**

```bash
git add src/tests/integration/items/target-quantity.integration.test.ts
git commit -m "test(uc11): integration tests for updateItem targetQuantity"
```

---

## Task 4: `listItemsForPlanMode` service + integration tests

**Files:**
- Modify: `src/lib/transactions/service.ts`
- Create: `src/tests/integration/transactions/plan-mode.integration.test.ts`

**Step 1: Add `PlanModeItem` type and function signature to `src/lib/transactions/service.ts`**

Add after the existing type exports:

```ts
export type PlanModeItem = {
  id: string;
  orgId: string;
  name: string;
  unit: string;
  targetQuantity: number;
  currentStock: number;
  deficit: number;
  completionPct: number;
  note: string | null;
};

export type ListItemsForPlanModeInput = {
  q?: string;
  excludeExpired?: boolean;
};
```

**Step 2: Write failing integration test**

```ts
// src/tests/integration/transactions/plan-mode.integration.test.ts
// (copy boilerplate helpers from stock-view.integration.test.ts)
import { createInboundBatch, listItemsForPlanMode } from "@/lib/transactions/service";
import { updateItem } from "@/lib/items/service";

async function seedItemWithTarget(
  orgId: string,
  userId: string,
  name: string,
  targetQuantity: number,
  adminClient: ReturnType<typeof createClient>
) {
  const { data, error } = await adminClient
    .from("items")
    .insert({ org_id: orgId, name, unit: "個", min_stock: 0,
               target_quantity: targetQuantity, created_by: userId, updated_by: userId })
    .select("id").single();
  if (error || !data) throw error ?? new Error("Failed to seed item");
  return data.id as string;
}

describe("listItemsForPlanMode (UC-11)", () => {
  it("only returns items with target_quantity set", async () => {
    const user = await createTestUser("pm");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);

      const withTarget = await seedItemWithTarget(org.org_id, user.userId, "水", 10, adminClient);
      await seedItem(org.org_id, user.userId, "無目標品項"); // no target_quantity

      const items = await listItemsForPlanMode(asServiceClient(client));
      expect(items.map(i => i.id)).toContain(withTarget);
      expect(items.every(i => i.targetQuantity > 0)).toBe(true);
      expect(items.find(i => i.name === "無目標品項")).toBeUndefined();
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("calculates currentStock excluding expired batches by default", async () => {
    const user = await createTestUser("pm");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItemWithTarget(org.org_id, user.userId, "罐頭", 20, adminClient);

      await createInboundBatch(asServiceClient(client), { itemId, quantity: 8, expiryDate: "2030-01-01" });
      await createInboundBatch(asServiceClient(client), { itemId, quantity: 5, expiryDate: "2020-01-01" }); // expired

      const items = await listItemsForPlanMode(asServiceClient(client), { excludeExpired: true });
      const item = items.find(i => i.id === itemId)!;
      expect(item.currentStock).toBe(8);   // expired batch excluded
      expect(item.deficit).toBe(12);       // 20 - 8
      expect(item.completionPct).toBeCloseTo(40);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("includes expired batches when excludeExpired=false", async () => {
    const user = await createTestUser("pm");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItemWithTarget(org.org_id, user.userId, "餅乾", 10, adminClient);

      await createInboundBatch(asServiceClient(client), { itemId, quantity: 3, expiryDate: "2030-01-01" });
      await createInboundBatch(asServiceClient(client), { itemId, quantity: 4, expiryDate: "2020-01-01" });

      const items = await listItemsForPlanMode(asServiceClient(client), { excludeExpired: false });
      const item = items.find(i => i.id === itemId)!;
      expect(item.currentStock).toBe(7);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("sorts incomplete items before complete items", async () => {
    const user = await createTestUser("pm");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);

      const incompleteId = await seedItemWithTarget(org.org_id, user.userId, "A不足", 10, adminClient);
      const completeId = await seedItemWithTarget(org.org_id, user.userId, "B達標", 5, adminClient);

      await createInboundBatch(asServiceClient(client), { itemId: incompleteId, quantity: 3 });
      await createInboundBatch(asServiceClient(client), { itemId: completeId, quantity: 10 });

      const items = await listItemsForPlanMode(asServiceClient(client));
      const incompleteIdx = items.findIndex(i => i.id === incompleteId);
      const completeIdx = items.findIndex(i => i.id === completeId);
      expect(incompleteIdx).toBeLessThan(completeIdx);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("RLS: org isolation — cannot see another org's plan items", async () => {
    const user1 = await createTestUser("pm1");
    const user2 = await createTestUser("pm2");
    try {
      const client1 = await signIn(user1.email, user1.password);
      const org1 = await bootstrap(client1);
      await seedItemWithTarget(org1.org_id, user1.userId, "Org1品項", 5, adminClient);

      const client2 = await signIn(user2.email, user2.password);
      await bootstrap(client2);

      const items = await listItemsForPlanMode(asServiceClient(client2));
      expect(items.find(i => i.name === "Org1品項")).toBeUndefined();
    } finally {
      await cleanupTestUser(user1.userId);
      await cleanupTestUser(user2.userId);
    }
  });
});
```

**Step 3: Run test — expect FAIL**

```bash
cd src && npm run test:integration -- plan-mode.integration
```
Expected: FAIL — `listItemsForPlanMode` not exported from service.

**Step 4: Implement `listItemsForPlanMode` in `src/lib/transactions/service.ts`**

Add after the existing service functions (use the same `getMembership` helper that is already in this file):

```ts
export async function listItemsForPlanMode(
  supabase: SupabaseClient,
  input: ListItemsForPlanModeInput = {},
): Promise<PlanModeItem[]> {
  const { q, excludeExpired = true } = input;
  const membership = await getMembership(supabase);

  let itemQuery = supabase
    .from("items")
    .select("id, org_id, name, unit, target_quantity, note")
    .eq("org_id", membership.org_id)
    .eq("is_deleted", false)
    .not("target_quantity", "is", null)
    .order("name", { ascending: true });

  if (q) {
    itemQuery = itemQuery.ilike("name", `%${q}%`);
  }

  const { data: items, error: itemsError } = await itemQuery;
  if (itemsError) throw new TransactionError(TRANSACTION_ERROR_CODES.INVALID_QUERY);
  if (!items || items.length === 0) return [];

  const itemIds = items.map((i) => i.id);
  const { data: batches, error: batchError } = await supabase
    .from("batches")
    .select("item_id, quantity, expiry_date")
    .eq("org_id", membership.org_id)
    .in("item_id", itemIds)
    .gt("quantity", 0);

  if (batchError) throw new TransactionError(TRANSACTION_ERROR_CODES.INVALID_QUERY);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result: PlanModeItem[] = items.map((item) => {
    const itemBatches = (batches ?? []).filter((b) => b.item_id === item.id);
    const currentStock = itemBatches.reduce((sum, b) => {
      if (
        excludeExpired &&
        b.expiry_date != null &&
        new Date(b.expiry_date) < today
      ) {
        return sum;
      }
      return sum + Number(b.quantity);
    }, 0);

    const targetQuantity = Number(item.target_quantity);
    const deficit = Math.max(targetQuantity - currentStock, 0);
    const completionPct =
      targetQuantity > 0
        ? Math.min((currentStock / targetQuantity) * 100, 100)
        : 0;

    return {
      id: item.id,
      orgId: item.org_id,
      name: item.name,
      unit: item.unit,
      targetQuantity,
      currentStock,
      deficit,
      completionPct,
      note: item.note,
    };
  });

  // Sort: incomplete first (completionPct < 100), then complete; alphabetical within each group
  return result.sort((a, b) => {
    const aComplete = a.completionPct >= 100 ? 1 : 0;
    const bComplete = b.completionPct >= 100 ? 1 : 0;
    if (aComplete !== bComplete) return aComplete - bComplete;
    return a.name.localeCompare(b.name);
  });
}
```

**Step 5: Run test — expect PASS**

```bash
cd src && npm run test:integration -- plan-mode.integration
```
Expected: PASS (5 tests).

**Step 6: Typecheck**

```bash
cd src && npm run typecheck
```
Expected: no errors.

**Step 7: Commit**

```bash
git add src/lib/transactions/service.ts \
        src/tests/integration/transactions/plan-mode.integration.test.ts
git commit -m "feat(uc11): add listItemsForPlanMode service + integration tests"
```

---

## Task 5: `listItemsWithBatches` service + integration tests

**Files:**
- Modify: `src/lib/transactions/service.ts`
- Create: `src/tests/integration/transactions/items-with-batches.integration.test.ts`

**Step 1: Add `ItemWithBatches` type to `src/lib/transactions/service.ts`**

```ts
export type ItemWithBatches = {
  id: string;
  orgId: string;
  name: string;
  unit: string;
  note: string | null;
  targetQuantity: number | null;
  batches: BatchWithRefs[];
};

export type ListItemsWithBatchesInput = {
  q?: string;
};
```

**Step 2: Write failing integration test**

```ts
// src/tests/integration/transactions/items-with-batches.integration.test.ts
// (copy boilerplate helpers from stock-view.integration.test.ts)
import { createInboundBatch, listItemsWithBatches } from "@/lib/transactions/service";

describe("listItemsWithBatches (UC-11 restock mode)", () => {
  it("includes items with no batches as items with empty batches array", async () => {
    const user = await createTestUser("iwb");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const noBatchItemId = await seedItem(org.org_id, user.userId, "無批次品項");
      const withBatchItemId = await seedItem(org.org_id, user.userId, "有批次品項");

      await createInboundBatch(asServiceClient(client), {
        itemId: withBatchItemId, quantity: 5,
      });

      const items = await listItemsWithBatches(asServiceClient(client));

      const noBatch = items.find(i => i.id === noBatchItemId)!;
      expect(noBatch).toBeDefined();
      expect(noBatch.batches).toHaveLength(0);

      const withBatch = items.find(i => i.id === withBatchItemId)!;
      expect(withBatch).toBeDefined();
      expect(withBatch.batches).toHaveLength(1);
      expect(withBatch.batches[0].quantity).toBe(5);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("groups multiple batches under the same item", async () => {
    const user = await createTestUser("iwb");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId, "多批次品項");

      await createInboundBatch(asServiceClient(client), { itemId, quantity: 3, expiryDate: "2028-01-01" });
      await createInboundBatch(asServiceClient(client), { itemId, quantity: 7, expiryDate: "2029-01-01" });

      const items = await listItemsWithBatches(asServiceClient(client));
      const item = items.find(i => i.id === itemId)!;
      expect(item.batches).toHaveLength(2);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("RLS: does not return another org's items", async () => {
    const user1 = await createTestUser("iwb1");
    const user2 = await createTestUser("iwb2");
    try {
      const client1 = await signIn(user1.email, user1.password);
      const org1 = await bootstrap(client1);
      await seedItem(org1.org_id, user1.userId, "Org1Only");

      const client2 = await signIn(user2.email, user2.password);
      await bootstrap(client2);

      const items = await listItemsWithBatches(asServiceClient(client2));
      expect(items.find(i => i.name === "Org1Only")).toBeUndefined();
    } finally {
      await cleanupTestUser(user1.userId);
      await cleanupTestUser(user2.userId);
    }
  });
});
```

**Step 3: Run test — expect FAIL**

```bash
cd src && npm run test:integration -- items-with-batches.integration
```
Expected: FAIL.

**Step 4: Implement `listItemsWithBatches` in `src/lib/transactions/service.ts`**

Add after `listItemsForPlanMode`:

```ts
export async function listItemsWithBatches(
  supabase: SupabaseClient,
  input: ListItemsWithBatchesInput = {},
): Promise<ItemWithBatches[]> {
  const { q } = input;
  const membership = await getMembership(supabase);

  let itemQuery = supabase
    .from("items")
    .select("id, org_id, name, unit, note, target_quantity")
    .eq("org_id", membership.org_id)
    .eq("is_deleted", false)
    .order("name", { ascending: true });

  if (q) {
    itemQuery = itemQuery.ilike("name", `%${q}%`);
  }

  const { data: items, error: itemsError } = await itemQuery;
  if (itemsError) throw new TransactionError(TRANSACTION_ERROR_CODES.INVALID_QUERY);
  if (!items || items.length === 0) return [];

  const { data: batches, error: batchError } = await supabase
    .from("batches")
    .select(`
      id, org_id, warehouse_id, item_id, quantity, expiry_date,
      storage_location_id, tag_id,
      storage_locations(name),
      tags(name)
    `)
    .eq("org_id", membership.org_id)
    .gt("quantity", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (batchError) throw new TransactionError(TRANSACTION_ERROR_CODES.INVALID_QUERY);

  const batchesByItemId = new Map<string, BatchWithRefs[]>();
  for (const b of batches ?? []) {
    const loc = b.storage_locations as { name: string } | null;
    const tag = b.tags as { name: string } | null;
    const item = items.find(i => i.id === b.item_id);
    if (!item) continue;

    const batch: BatchWithRefs = {
      id: b.id,
      orgId: b.org_id,
      warehouseId: b.warehouse_id,
      itemId: b.item_id,
      quantity: Number(b.quantity),
      expiryDate: b.expiry_date,
      storageLocationId: b.storage_location_id,
      tagId: b.tag_id,
      itemName: item.name,
      itemUnit: item.unit,
      storageLocationName: loc?.name ?? null,
      tagName: tag?.name ?? null,
    };

    const existing = batchesByItemId.get(b.item_id) ?? [];
    existing.push(batch);
    batchesByItemId.set(b.item_id, existing);
  }

  return items.map((item) => ({
    id: item.id,
    orgId: item.org_id,
    name: item.name,
    unit: item.unit,
    note: item.note,
    targetQuantity: item.target_quantity != null ? Number(item.target_quantity) : null,
    batches: batchesByItemId.get(item.id) ?? [],
  }));
}
```

**Step 5: Run test — expect PASS**

```bash
cd src && npm run test:integration -- items-with-batches.integration
```
Expected: PASS (3 tests).

**Step 6: Run all integration tests to check no regressions**

```bash
cd src && npm run test:integration
```
Expected: all pass.

**Step 7: Commit**

```bash
git add src/lib/transactions/service.ts \
        src/tests/integration/transactions/items-with-batches.integration.test.ts
git commit -m "feat(uc11): add listItemsWithBatches service + integration tests"
```

---

## Task 6: Query keys + API routes

**Files:**
- Modify: `src/lib/query-keys.ts`
- Create: `src/app/api/stock/plan-items/route.ts`
- Create: `src/app/api/stock/items-with-batches/route.ts`

**Step 1: Update `src/lib/query-keys.ts`**

Add two new factory entries:

```ts
export const queryKeys = {
  // ...existing...
  planModeItems: (q?: string, excludeExpired = true) =>
    ["stock", "planModeItems", q ?? "", excludeExpired] as const,
  itemsWithBatches: (q?: string) =>
    ["stock", "itemsWithBatches", q ?? ""] as const,
};
```

**Step 2: Create `src/app/api/stock/plan-items/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listItemsForPlanMode } from "@/lib/transactions/service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q") ?? undefined;
    const excludeExpired = searchParams.get("excludeExpired") !== "false";
    const supabase = await createClient();
    const t = Date.now();
    const items = await listItemsForPlanMode(supabase, { q, excludeExpired });
    const dur = Date.now() - t;
    return NextResponse.json(items, {
      headers: { "Server-Timing": `db;desc="listItemsForPlanMode";dur=${dur}` },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

**Step 3: Create `src/app/api/stock/items-with-batches/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listItemsWithBatches } from "@/lib/transactions/service";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? undefined;
    const supabase = await createClient();
    const t = Date.now();
    const items = await listItemsWithBatches(supabase, { q });
    const dur = Date.now() - t;
    return NextResponse.json(items, {
      headers: { "Server-Timing": `db;desc="listItemsWithBatches";dur=${dur}` },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

**Step 4: Typecheck**

```bash
cd src && npm run typecheck
```
Expected: no errors.

**Step 5: Smoke check routes exist (build)**

```bash
cd src && npm run build 2>&1 | grep -E "(error|plan-items|items-with-batches)"
```
Expected: the two new routes appear in build output, no errors.

**Step 6: Commit**

```bash
git add src/lib/query-keys.ts \
        src/app/api/stock/plan-items/route.ts \
        src/app/api/stock/items-with-batches/route.ts
git commit -m "feat(uc11): add plan-items and items-with-batches API routes"
```

---

## Task 7: Plan mode server action (`updateItemTargetQuantityAction`)

**Files:**
- Create: `src/app/stock/plan-mode-actions.ts`

**Step 1: Create `src/app/stock/plan-mode-actions.ts`**

```ts
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
```

**Step 2: Typecheck**

```bash
cd src && npm run typecheck
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/app/stock/plan-mode-actions.ts
git commit -m "feat(uc11): add updateItemTargetQuantityAction server action"
```

---

## Task 8: UI shell — mode tab navigation

**Files:**
- Modify: `src/app/stock/page.tsx`
- Modify: `src/components/stock-page-client.tsx`

**Step 1: Read current `src/components/stock-page-client.tsx` in full**

Understand the full component before modifying.

**Step 2: Add mode tab UI to `stock-page-client.tsx`**

At the top of the file, add the `cn` import if not present (`import { cn } from "@/lib/utils"`) and `Link` from `next/link`.

Add this component inside the file (above the main export):

```tsx
type StockMode = "consume" | "plan" | "restock";

function ModeTabs({ currentMode }: { currentMode: StockMode }) {
  const tabs: { mode: StockMode; label: string }[] = [
    { mode: "consume", label: "消耗" },
    { mode: "plan", label: "採買規劃" },
    { mode: "restock", label: "入庫盤點" },
  ];

  return (
    <div className="flex gap-0 border-b mb-4 sticky top-0 bg-background z-10">
      {tabs.map((tab) => (
        <Link
          key={tab.mode}
          href={`/stock?mode=${tab.mode}`}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            currentMode === tab.mode
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
```

**Step 3: Add `useSearchParams` mode reading to `StockPageClient`**

In the client component's function body, add:

```tsx
import { useSearchParams } from "next/navigation";

// inside the component:
const searchParams = useSearchParams();
const rawMode = searchParams.get("mode");
const mode: StockMode =
  rawMode === "plan" || rawMode === "restock" ? rawMode : "consume";
```

**Step 4: Wrap existing batch list in `mode === "consume"` condition**

The existing batch rendering becomes the consume mode. Wrap with:

```tsx
{mode === "consume" && (
  /* existing batch list JSX here */
)}
{mode === "plan" && (
  <div className="text-muted-foreground text-sm p-4">採買規劃模式（Task 9 中實作）</div>
)}
{mode === "restock" && (
  <div className="text-muted-foreground text-sm p-4">入庫盤點模式（Task 10 中實作）</div>
)}
```

**Step 5: Add `<ModeTabs currentMode={mode} />` above the mode conditionals**

Insert `<ModeTabs currentMode={mode} />` as the first element inside the return JSX, before the existing content.

**Step 6: Dev server smoke check — tabs render and switch modes**

```bash
cd src && npm run dev
```
Open `http://localhost:5566/stock`. Verify:
- Three tabs appear at top
- Clicking "採買規劃" changes URL to `/stock?mode=plan` and shows placeholder text
- Clicking "入庫盤點" shows restock placeholder
- Clicking "消耗" shows original batch list

**Step 7: Commit**

```bash
git add src/components/stock-page-client.tsx src/app/stock/page.tsx
git commit -m "feat(uc11): add mode tab navigation to stock page"
```

---

## Task 9: UI — Plan Mode View (`PlanModeView`)

**Files:**
- Create: `src/components/plan-mode-view.tsx`
- Modify: `src/components/stock-page-client.tsx`

**Step 1: Create `src/components/plan-mode-view.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { PlanModeItem } from "@/lib/transactions/service";
import { updateItemTargetQuantityAction } from "@/app/stock/plan-mode-actions";
import { InboundModal } from "@/components/inbound-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function PlanModeView() {
  const [q, setQ] = useState("");
  const [excludeExpired, setExcludeExpired] = useState(true);
  const [inboundItemId, setInboundItemId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<PlanModeItem[]>({
    queryKey: queryKeys.planModeItems(q, excludeExpired),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("excludeExpired", String(excludeExpired));
      const res = await fetch(`/api/stock/plan-items?${params}`);
      if (!res.ok) throw new Error("Failed to load plan items");
      return res.json();
    },
  });

  async function handleTargetChange(itemId: string, raw: string) {
    const val = raw === "" ? null : Number(raw);
    if (val !== null && (isNaN(val) || val <= 0)) return;
    const result = await updateItemTargetQuantityAction(itemId, val);
    if (result.ok) {
      await queryClient.invalidateQueries({ queryKey: ["stock", "planModeItems"] });
    }
  }

  const inboundItem = items.find((i) => i.id === inboundItemId);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-2 flex-wrap items-center">
        <Input
          placeholder="搜尋品項…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant={excludeExpired ? "default" : "outline"}
          size="sm"
          onClick={() => setExcludeExpired((v) => !v)}
        >
          {excludeExpired ? "不含過期" : "含過期"}
        </Button>
      </div>

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">
          尚無品項設定目標數量。請在品項編輯頁設定「目標數量」以加入採買規劃。
        </p>
      )}

      {/* Items list */}
      <div className="divide-y">
        {items.map((item) => (
          <div key={item.id} className="py-3 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">{item.name}</span>
              <div className="flex items-center gap-2">
                {item.completionPct >= 100 ? (
                  <Badge variant="secondary">已達標</Badge>
                ) : (
                  <Badge variant="outline">缺 {item.deficit} {item.unit}</Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInboundItemId(item.id)}
                >
                  入庫
                </Button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden max-w-xs">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${item.completionPct}%` }}
              />
            </div>

            {/* Quantities row */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span>現有 {item.currentStock} {item.unit}</span>
              <span className="flex items-center gap-1">
                <Label className="text-xs">目標</Label>
                <input
                  type="number"
                  min="1"
                  defaultValue={item.targetQuantity}
                  className="w-16 text-right border rounded px-1 py-0.5 text-sm"
                  onBlur={(e) => handleTargetChange(item.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                />
                <span>{item.unit}</span>
              </span>
              <span>{Math.round(item.completionPct)}%</span>
            </div>

            {item.note && (
              <p className="text-xs text-muted-foreground">{item.note}</p>
            )}
          </div>
        ))}
      </div>

      {/* Inbound modal */}
      {inboundItem && (
        <InboundModal
          open={!!inboundItemId}
          itemId={inboundItem.id}
          itemName={inboundItem.name}
          onClose={() => setInboundItemId(null)}
          onSuccess={() => {
            setInboundItemId(null);
            void queryClient.invalidateQueries({
              queryKey: ["stock", "planModeItems"],
            });
          }}
        />
      )}
    </div>
  );
}
```

**Step 2: Replace plan mode placeholder in `stock-page-client.tsx`**

Replace the placeholder:
```tsx
{mode === "plan" && (
  <div className="text-muted-foreground text-sm p-4">採買規劃模式（Task 9 中實作）</div>
)}
```
With:
```tsx
{mode === "plan" && <PlanModeView />}
```
Add import at top: `import { PlanModeView } from "@/components/plan-mode-view";`

**Step 3: Typecheck**

```bash
cd src && npm run typecheck
```
Expected: no errors.

**Step 4: Dev server smoke check — plan mode works**

Open `/stock?mode=plan`. Verify:
- Items with `target_quantity` appear (may need to set one via `/stock/items` or DB directly)
- Progress bar renders
- "不含過期 / 含過期" toggle changes label
- Inline target quantity editing saves on blur (check dev server log for no errors)
- "入庫" button opens inbound modal

**Step 5: Commit**

```bash
git add src/components/plan-mode-view.tsx src/components/stock-page-client.tsx
git commit -m "feat(uc11): implement plan mode view with inline target quantity editing"
```

---

## Task 10: UI — Restock Mode View (`RestockModeView`)

**Files:**
- Create: `src/components/restock-mode-view.tsx`
- Modify: `src/components/stock-page-client.tsx`

**Step 1: Create `src/components/restock-mode-view.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { ItemWithBatches } from "@/lib/transactions/service";
import { InboundModal } from "@/components/inbound-modal";
import { AdjustModal } from "@/components/adjust-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function RestockModeView() {
  const [q, setQ] = useState("");
  const [inboundTarget, setInboundTarget] = useState<{
    itemId: string;
    itemName: string;
    batchId?: string;
  } | null>(null);
  const [adjustBatch, setAdjustBatch] = useState<{
    batchId: string;
    itemName: string;
    currentQty: number;
  } | null>(null);
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<ItemWithBatches[]>({
    queryKey: queryKeys.itemsWithBatches(q),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/stock/items-with-batches?${params}`);
      if (!res.ok) throw new Error("Failed to load items");
      return res.json();
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["stock", "itemsWithBatches"] });

  return (
    <div className="space-y-4">
      <Input
        placeholder="搜尋品項…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-xs"
      />

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">尚無品項。</p>
      )}

      <div className="divide-y">
        {items.map((item) => (
          <div key={item.id} className="py-3">
            {/* Item header row */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium">{item.name}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setInboundTarget({ itemId: item.id, itemName: item.name })
                }
              >
                + 入庫
              </Button>
            </div>

            {/* No batches state */}
            {item.batches.length === 0 && (
              <p className="text-xs text-muted-foreground pl-2">尚無批次</p>
            )}

            {/* Batch rows */}
            {item.batches.map((batch) => (
              <div
                key={batch.id}
                className="pl-3 py-1 flex items-center justify-between gap-2 text-sm border-l ml-1 flex-wrap"
              >
                <div className="flex gap-3 items-center text-muted-foreground flex-wrap">
                  <span className="tabular-nums font-medium text-foreground">
                    {batch.quantity} {item.unit}
                  </span>
                  {batch.expiryDate && (
                    <Badge variant="outline" className="text-xs">
                      到期 {batch.expiryDate}
                    </Badge>
                  )}
                  {batch.storageLocationName && (
                    <span>{batch.storageLocationName}</span>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setAdjustBatch({
                        batchId: batch.id,
                        itemName: item.name,
                        currentQty: batch.quantity,
                      })
                    }
                  >
                    盤點
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setInboundTarget({
                        itemId: item.id,
                        itemName: item.name,
                        batchId: batch.id,
                      })
                    }
                  >
                    入庫
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {inboundTarget && (
        <InboundModal
          open={!!inboundTarget}
          itemId={inboundTarget.itemId}
          itemName={inboundTarget.itemName}
          onClose={() => setInboundTarget(null)}
          onSuccess={() => { setInboundTarget(null); void invalidate(); }}
        />
      )}

      {adjustBatch && (
        <AdjustModal
          open={!!adjustBatch}
          batchId={adjustBatch.batchId}
          itemName={adjustBatch.itemName}
          currentQuantity={adjustBatch.currentQty}
          onClose={() => setAdjustBatch(null)}
          onSuccess={() => { setAdjustBatch(null); void invalidate(); }}
        />
      )}
    </div>
  );
}
```

> **Note:** Check the actual props of `InboundModal` and `AdjustModal` in their source files before writing this component — the prop names above (`itemId`, `itemName`, `batchId`, `currentQuantity`, `onClose`, `onSuccess`) must match the actual component interfaces. Adjust if needed.

**Step 2: Replace restock placeholder in `stock-page-client.tsx`**

Replace:
```tsx
{mode === "restock" && (
  <div className="text-muted-foreground text-sm p-4">入庫盤點模式（Task 10 中實作）</div>
)}
```
With:
```tsx
{mode === "restock" && <RestockModeView />}
```
Add import: `import { RestockModeView } from "@/components/restock-mode-view";`

**Step 3: Typecheck**

```bash
cd src && npm run typecheck
```
Expected: no errors. Fix any prop mismatches found in Step 1 note.

**Step 4: Dev server smoke check — restock mode works**

Open `/stock?mode=restock`. Verify:
- All items appear (including items without batches showing "尚無批次")
- Items with batches show each batch on its own indented row
- "盤點" opens adjustment modal; "入庫" opens inbound modal
- After completing an operation, list refreshes

**Step 5: Commit**

```bash
git add src/components/restock-mode-view.tsx src/components/stock-page-client.tsx
git commit -m "feat(uc11): implement restock mode view"
```

---

## Task 11: Deprecation cleanup

**Files:**
- Modify: `src/app/stock/items/page.tsx`
- Modify: `src/components/stock-page-client.tsx` (remove nav link if present)
- Search all files for `/stock/items` nav references

**Step 1: Find all navigation references to `/stock/items`**

```bash
cd /mnt/e/Alex/works/quell-weaver/stockmore
grep -r '"/stock/items"' src/ --include="*.tsx" --include="*.ts" -l
grep -r "stock/items" src/ --include="*.tsx" --include="*.ts" -l
```

**Step 2: Remove navigation links**

For each file found in Step 1 (likely `stock-page-client.tsx` or a nav component), remove or comment out the link. Do NOT delete the target route files.

**Step 3: Mark `/stock/items/page.tsx` as deprecated**

Add at the top of the file (after any imports):

```tsx
/**
 * @deprecated UC-11: This page is superseded by `/stock?mode=restock`.
 * Navigation links have been removed. This file is kept for reference
 * and will be deleted in a future cleanup PR.
 */
```

**Step 4: Mark `/stock/items/actions.ts` as deprecated**

Add at the top:

```ts
/**
 * @deprecated UC-11: actions for the deprecated /stock/items page.
 * Do not add new functionality here. Will be removed in a future cleanup PR.
 */
```

**Step 5: Also remove `min_stock` from any UI that still references it**

Search:
```bash
grep -r "minStock\|min_stock" src/components/ src/app/stock/ --include="*.tsx" --include="*.ts" -n
```

Remove any UI rendering of `minStock` (e.g., form inputs in items forms). Leave the type field and DB column alone.

**Step 6: Typecheck + lint**

```bash
cd src && npm run typecheck && npm run lint
```
Expected: no errors.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore(uc11): deprecate /stock/items route and remove nav links, remove minStock from UI"
```

---

## Task 12: E2E tests (minimal happy path)

**Files:**
- Create: `src/tests/e2e/uc11-mode-views.spec.ts`

**Step 1: Check existing e2e setup**

Read `src/tests/e2e/` to understand how auth is handled (global setup, auth state fixtures, etc.).

**Step 2: Write minimal e2e spec**

```ts
// src/tests/e2e/uc11-mode-views.spec.ts
import { test, expect } from "@playwright/test";

test.describe("UC-11 mode-based stock views", () => {
  // Assumes the test uses an authenticated session from global setup
  // Check existing e2e specs for the correct use of storageState / auth fixtures

  test("mode tabs are visible and switch correctly", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByRole("link", { name: "消耗" })).toBeVisible();
    await expect(page.getByRole("link", { name: "採買規劃" })).toBeVisible();
    await expect(page.getByRole("link", { name: "入庫盤點" })).toBeVisible();

    await page.getByRole("link", { name: "採買規劃" }).click();
    await expect(page).toHaveURL(/mode=plan/);

    await page.getByRole("link", { name: "入庫盤點" }).click();
    await expect(page).toHaveURL(/mode=restock/);

    await page.getByRole("link", { name: "消耗" }).click();
    await expect(page).toHaveURL(/\/stock/);
  });

  test("restock mode shows all items including items without batches", async ({ page }) => {
    await page.goto("/stock?mode=restock");
    // Wait for items to load (replace selector with actual rendered element)
    await page.waitForSelector("[data-testid='restock-item-row'], .divide-y > div", {
      timeout: 5000,
    });
    // At minimum: page does not show an error state
    await expect(page.locator("body")).not.toContainText("Unauthorized");
    await expect(page.locator("body")).not.toContainText("Error");
  });

  test("consume mode (default) loads without mode param", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByRole("link", { name: "消耗" })).toHaveClass(/border-primary/);
  });
});
```

> **Note:** Adjust selectors to match actual rendered output. Refer to existing e2e specs for auth state setup pattern (usually `use: { storageState: "auth-state.json" }` in test options).

**Step 3: Run e2e smoke test**

```bash
cd src && npm run test:e2e:smoke
```
Or if the full suite is needed:
```bash
bash scripts/testing/run-e2e.sh
```
Expected: tests pass or are skipped with clear reason if dev server is not running.

**Step 4: Run full test suite one last time**

```bash
cd src && npm run test:unit && npm run test:integration
```
Expected: all pass.

**Step 5: Commit + push**

```bash
git add src/tests/e2e/uc11-mode-views.spec.ts
git commit -m "test(uc11): minimal e2e tests for mode tab navigation"
```

---

## Final Verification Checklist

Before marking UC-11 as complete, verify against Acceptance Criteria in `docs/features/uc/uc_11_mode_based_views.md`:

- [ ] AC1: Only items with `target_quantity` appear in plan mode
- [ ] AC2: Expired toggle works — stock figures update instantly
- [ ] AC3: Deficit and completion % calculate correctly
- [ ] AC4: Complete items sort after incomplete items
- [ ] AC5: Inbound from plan mode refreshes the list
- [ ] AC6: `/stock` (no param) defaults to consume mode (same as UC-08)
- [ ] AC7: All items appear in restock mode (including no-batch items)
- [ ] AC8: Batch rows in restock mode have both 盤點 and 入庫 buttons
- [ ] AC9: No-batch item rows in restock mode only have 入庫 button
- [ ] AC10: `/stock/items` has no nav links; URL still works directly
- [ ] AC11: `min_stock` not visible in any UI field
- [ ] AC12: Cross-org RLS verified by integration tests
