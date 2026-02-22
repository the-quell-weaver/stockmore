import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { TRANSACTION_ERROR_CODES } from "@/lib/transactions/errors";
import {
  createInboundBatch,
  addInboundToBatch,
  listBatchesForItem,
} from "@/lib/transactions/service";
import { ITEM_ERROR_CODES } from "@/lib/items/errors";

function loadEnvFiles() {
  const candidatePaths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const envPath of candidatePaths) {
    if (!existsSync(envPath)) continue;
    const content = readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

loadEnvFiles();
const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createTestUser(prefix = "txn") {
  const suffix = randomUUID();
  const email = `integration.${prefix}.${suffix}@stockmore.local`;
  const password = `Password!${suffix.replace(/-/g, "")}`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw error ?? new Error("Failed to create test user");
  }
  return { userId: data.user.id, email, password };
}

async function cleanupTestUser(userId: string) {
  const memberships = await adminClient
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId);
  expect(memberships.error).toBeNull();

  const orgIds = Array.from(
    new Set((memberships.data ?? []).map((row) => row.org_id).filter(Boolean)),
  );

  if (orgIds.length > 0) {
    const deleteOrgs = await adminClient.from("orgs").delete().in("id", orgIds);
    expect(deleteOrgs.error).toBeNull();
  }

  const deleted = await adminClient.auth.admin.deleteUser(userId);
  expect(deleted.error).toBeNull();
}

async function signIn(email: string, password: string) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw error ?? new Error("Failed to sign in test user");
  }

  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    },
  });
}

async function bootstrap(client: Awaited<ReturnType<typeof signIn>>) {
  const result = await client.rpc("bootstrap_default_org_and_warehouse");
  expect(result.error).toBeNull();
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const typedRow = row as { org_id?: string; warehouse_id?: string } | null;
  if (!typedRow?.org_id || !typedRow.warehouse_id) {
    throw new Error("Missing org/warehouse id from bootstrap RPC");
  }
  return { org_id: typedRow.org_id, warehouse_id: typedRow.warehouse_id };
}

async function seedItem(orgId: string, userId: string) {
  const suffix = randomUUID().slice(0, 8);
  const { data, error } = await adminClient
    .from("items")
    .insert({
      org_id: orgId,
      name: `TestItem-${suffix}`,
      unit: "個",
      min_stock: 0,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

function asServiceClient(client: Awaited<ReturnType<typeof signIn>>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

describe("transactions service integration (UC_05)", () => {
  // AC1: owner 建立新批次，batch.quantity=10，transaction exists
  it("AC1: owner can create a new inbound batch with correct quantity", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const result = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });

      expect(result.batchId).toBeTruthy();
      expect(result.transactionId).toBeTruthy();
      expect(result.batchQuantity).toBe(10);

      // Verify batch row
      const { data: batch } = await adminClient
        .from("batches")
        .select("id, item_id, quantity, org_id")
        .eq("id", result.batchId)
        .single();
      expect(batch?.quantity).toBe(10);
      expect(batch?.item_id).toBe(itemId);
      expect(batch?.org_id).toBe(org.org_id);

      // Verify transaction row
      const { data: txn } = await adminClient
        .from("transactions")
        .select("id, type, quantity_delta, batch_id")
        .eq("id", result.transactionId)
        .single();
      expect(txn?.type).toBe("inbound");
      expect(txn?.quantity_delta).toBe(10);
      expect(txn?.batch_id).toBe(result.batchId);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC1: optional fields (expiry_date, note) are stored
  it("AC1 extended: new batch stores expiry_date and note", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const result = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 3,
        expiryDate: "2028-06-30",
        note: "Batch note",
      });

      const { data: batch } = await adminClient
        .from("batches")
        .select("expiry_date")
        .eq("id", result.batchId)
        .single();
      expect(batch?.expiry_date).toBe("2028-06-30");

      const { data: txn } = await adminClient
        .from("transactions")
        .select("note")
        .eq("id", result.transactionId)
        .single();
      expect(txn?.note).toBe("Batch note");
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC2: 對既有 batch 入庫，batch.quantity 由 10 → 15
  it("AC2: adding to existing batch increases quantity correctly", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      // Create initial batch with quantity=10
      const initial = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });
      expect(initial.batchQuantity).toBe(10);

      // Add 5 more to the batch
      const updated = await addInboundToBatch(asServiceClient(client), {
        batchId: initial.batchId,
        quantity: 5,
      });

      expect(updated.batchId).toBe(initial.batchId);
      expect(updated.transactionId).not.toBe(initial.transactionId);
      expect(updated.batchQuantity).toBe(15);

      // Verify via admin client
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", initial.batchId)
        .single();
      expect(batch?.quantity).toBe(15);

      // Two separate transactions created
      const { data: txns } = await adminClient
        .from("transactions")
        .select("id, quantity_delta, type")
        .eq("batch_id", initial.batchId)
        .order("created_at", { ascending: true });
      expect(txns).toHaveLength(2);
      expect(txns?.[0]?.quantity_delta).toBe(10);
      expect(txns?.[1]?.quantity_delta).toBe(5);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC3: viewer 被 FORBIDDEN
  it("AC3: viewer is rejected with FORBIDDEN", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      // Downgrade to viewer
      const setViewer = await client
        .from("org_memberships")
        .update({ role: "viewer" })
        .eq("org_id", org.org_id)
        .eq("user_id", user.userId);
      expect(setViewer.error).toBeNull();

      await expect(
        createInboundBatch(asServiceClient(client), { itemId, quantity: 5 }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.FORBIDDEN });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC4: quantity 非整數或 <=0 → validation error (service layer, no DB hit)
  it("AC4: quantity=0 throws QUANTITY_INVALID before reaching DB", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);
      const suffix = randomUUID().slice(0, 8);
      // Use a fake item ID – validation should fail before the DB call
      await expect(
        createInboundBatch(asServiceClient(client), {
          itemId: `00000000-0000-0000-0000-${suffix.padStart(12, "0")}`,
          quantity: 0,
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("AC4: fractional quantity throws QUANTITY_INVALID", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);
      await expect(
        createInboundBatch(asServiceClient(client), {
          itemId: randomUUID(),
          quantity: 1.5,
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC5: 同 idempotency_key 重送只產生 1 筆 transaction
  it("AC5: duplicate submission with same idempotency_key returns same transaction", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const key = randomUUID();

      const first = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 7,
        idempotencyKey: key,
      });

      // Second call with same key
      const second = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 7,
        idempotencyKey: key,
      });

      expect(second.batchId).toBe(first.batchId);
      expect(second.transactionId).toBe(first.transactionId);

      // Only 1 transaction in DB
      const { data: txns } = await adminClient
        .from("transactions")
        .select("id")
        .eq("batch_id", first.batchId);
      expect(txns).toHaveLength(1);

      // Only 1 batch in DB
      const { data: batches } = await adminClient
        .from("batches")
        .select("id, quantity")
        .eq("item_id", itemId);
      expect(batches).toHaveLength(1);
      expect(batches?.[0]?.quantity).toBe(7);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC5 variant: idempotency on add_inbound_to_batch
  it("AC5 variant: duplicate addInboundToBatch with same key returns same result", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const initial = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });

      const key = randomUUID();

      const first = await addInboundToBatch(asServiceClient(client), {
        batchId: initial.batchId,
        quantity: 5,
        idempotencyKey: key,
      });

      const second = await addInboundToBatch(asServiceClient(client), {
        batchId: initial.batchId,
        quantity: 5,
        idempotencyKey: key,
      });

      expect(second.transactionId).toBe(first.transactionId);

      // Quantity should be 15 (not 20)
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", initial.batchId)
        .single();
      expect(batch?.quantity).toBe(15);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // Cross-org RLS: cannot inbound to batch belonging to another org
  it("cross-org: cannot add inbound to batch from another org", async () => {
    const userA = await createTestUser("txna");
    const userB = await createTestUser("txnb");
    try {
      const clientA = await signIn(userA.email, userA.password);
      const clientB = await signIn(userB.email, userB.password);
      const orgA = await bootstrap(clientA);
      await bootstrap(clientB);

      const itemId = await seedItem(orgA.org_id, userA.userId);

      // Create a batch in org A
      const batchA = await createInboundBatch(asServiceClient(clientA), {
        itemId,
        quantity: 10,
      });

      // User B tries to add inbound to org A's batch → BATCH_NOT_FOUND (org mismatch)
      await expect(
        addInboundToBatch(asServiceClient(clientB), {
          batchId: batchA.batchId,
          quantity: 5,
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.BATCH_NOT_FOUND });
    } finally {
      await cleanupTestUser(userA.userId);
      await cleanupTestUser(userB.userId);
    }
  });

  // Cross-org RLS: SELECT isolation — user B cannot see org A's batches
  it("cross-org: listBatchesForItem does not leak other org batches", async () => {
    const userA = await createTestUser("txna");
    const userB = await createTestUser("txnb");
    try {
      const clientA = await signIn(userA.email, userA.password);
      const clientB = await signIn(userB.email, userB.password);
      const orgA = await bootstrap(clientA);
      await bootstrap(clientB);

      const itemId = await seedItem(orgA.org_id, userA.userId);

      await createInboundBatch(asServiceClient(clientA), {
        itemId,
        quantity: 10,
      });

      // User B queries for the same item_id but belongs to different org
      const batchesForB = await listBatchesForItem(asServiceClient(clientB), itemId);
      expect(batchesForB).toHaveLength(0);
    } finally {
      await cleanupTestUser(userA.userId);
      await cleanupTestUser(userB.userId);
    }
  });

  // create_inbound_batch rejects soft-deleted item
  it("returns ITEM_NOT_FOUND for soft-deleted item", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      // Soft-delete the item via admin
      await adminClient
        .from("items")
        .update({ is_deleted: true, updated_by: user.userId })
        .eq("id", itemId);

      await expect(
        createInboundBatch(asServiceClient(client), { itemId, quantity: 1 }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.ITEM_NOT_FOUND });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // listBatchesForItem returns correct data
  it("listBatchesForItem returns all batches for an item in own org", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      await createInboundBatch(asServiceClient(client), { itemId, quantity: 3 });
      await createInboundBatch(asServiceClient(client), { itemId, quantity: 7 });

      const batches = await listBatchesForItem(asServiceClient(client), itemId);
      expect(batches.length).toBeGreaterThanOrEqual(2);
      const total = batches.reduce((sum, b) => sum + b.quantity, 0);
      expect(total).toBe(10);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });
});
