import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { TRANSACTION_ERROR_CODES } from "@/lib/transactions/errors";
import { consumeFromBatch, createInboundBatch } from "@/lib/transactions/service";

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

async function createTestUser(prefix = "consume") {
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

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw error ?? new Error("Failed to sign in test user");
  }

  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
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
      name: `ConsumeItem-${suffix}`,
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

describe("consumeFromBatch integration (UC_06)", () => {
  // AC1: owner 消耗 2.5，batch.quantity 從 10 → 7.5，1 筆 consumption transaction 產生
  it("AC1: owner can consume decimal quantity from batch", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      // Create batch with quantity=10
      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });
      expect(inbound.batchQuantity).toBe(10);

      // Consume 2.5
      const result = await consumeFromBatch(asServiceClient(client), {
        batchId: inbound.batchId,
        quantity: 2.5,
        note: "used in drill",
      });

      expect(result.batchId).toBe(inbound.batchId);
      expect(result.transactionId).toBeTruthy();
      expect(result.batchQuantity).toBe(7.5);

      // Verify batch row
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(7.5);

      // Verify transaction row
      const { data: txn } = await adminClient
        .from("transactions")
        .select("type, quantity_delta, note")
        .eq("id", result.transactionId)
        .single();
      expect(txn?.type).toBe("consumption");
      expect(Number(txn?.quantity_delta)).toBe(-2.5);
      expect(txn?.note).toBe("used in drill");
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC1 variant: integer quantity still accepted
  it("AC1 variant: owner can consume integer quantity", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 5,
      });

      const result = await consumeFromBatch(asServiceClient(client), {
        batchId: inbound.batchId,
        quantity: 3,
      });

      expect(result.batchQuantity).toBe(2);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC2: 消耗超過餘量 → INSUFFICIENT_STOCK，無新 transaction
  it("AC2: consuming more than available throws INSUFFICIENT_STOCK", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 1,
      });

      await expect(
        consumeFromBatch(asServiceClient(client), {
          batchId: inbound.batchId,
          quantity: 2,
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.INSUFFICIENT_STOCK });

      // Batch quantity must remain unchanged
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(1);

      // No consumption transaction produced
      const { data: txns } = await adminClient
        .from("transactions")
        .select("id, type")
        .eq("batch_id", inbound.batchId)
        .eq("type", "consumption");
      expect(txns).toHaveLength(0);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC2 variant: exact consumption (consume all) is allowed
  it("AC2 variant: consuming exactly the remaining quantity succeeds", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 5,
      });

      const result = await consumeFromBatch(asServiceClient(client), {
        batchId: inbound.batchId,
        quantity: 5,
      });

      expect(result.batchQuantity).toBe(0);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC3: viewer → FORBIDDEN
  it("AC3: viewer is rejected with FORBIDDEN", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });

      // Downgrade to viewer
      const setViewer = await client
        .from("org_memberships")
        .update({ role: "viewer" })
        .eq("org_id", org.org_id)
        .eq("user_id", user.userId);
      expect(setViewer.error).toBeNull();

      await expect(
        consumeFromBatch(asServiceClient(client), {
          batchId: inbound.batchId,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.FORBIDDEN });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC4: quantity ≤ 0 → QUANTITY_INVALID (service layer, no DB hit)
  it("AC4: quantity=0 throws QUANTITY_INVALID before DB", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      await expect(
        consumeFromBatch(asServiceClient(client), {
          batchId: randomUUID(),
          quantity: 0,
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("AC4: negative quantity throws QUANTITY_INVALID before DB", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      await expect(
        consumeFromBatch(asServiceClient(client), {
          batchId: randomUUID(),
          quantity: -1,
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC5: 相同 idempotency_key 重送 → 只產生 1 筆 transaction
  it("AC5: duplicate submission with same idempotency_key is idempotent", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });

      const key = randomUUID();

      const first = await consumeFromBatch(asServiceClient(client), {
        batchId: inbound.batchId,
        quantity: 3,
        idempotencyKey: key,
      });

      // Second call with same key
      const second = await consumeFromBatch(asServiceClient(client), {
        batchId: inbound.batchId,
        quantity: 3,
        idempotencyKey: key,
      });

      expect(second.transactionId).toBe(first.transactionId);
      expect(second.batchId).toBe(first.batchId);

      // Only 1 consumption transaction in DB
      const { data: txns } = await adminClient
        .from("transactions")
        .select("id, type")
        .eq("batch_id", inbound.batchId)
        .eq("type", "consumption");
      expect(txns).toHaveLength(1);

      // Batch quantity deducted only once (10 - 3 = 7)
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(7);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // Cross-org: 消耗跨 org 的 batch → BATCH_NOT_FOUND
  it("cross-org: cannot consume from another org's batch", async () => {
    const userA = await createTestUser("consumea");
    const userB = await createTestUser("consumeb");
    try {
      const clientA = await signIn(userA.email, userA.password);
      const clientB = await signIn(userB.email, userB.password);
      const orgA = await bootstrap(clientA);
      await bootstrap(clientB);

      const itemId = await seedItem(orgA.org_id, userA.userId);

      const batchA = await createInboundBatch(asServiceClient(clientA), {
        itemId,
        quantity: 10,
      });

      // User B tries to consume org A's batch
      await expect(
        consumeFromBatch(asServiceClient(clientB), {
          batchId: batchA.batchId,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.BATCH_NOT_FOUND });

      // Org A's batch quantity is untouched
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", batchA.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(10);
    } finally {
      await cleanupTestUser(userA.userId);
      await cleanupTestUser(userB.userId);
    }
  });

  // Concurrency: 兩個並發消耗 6，batch.quantity=10 → 總扣減不超過 10，不會出現負庫存
  it("concurrency: only one of two over-consuming requests succeeds", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });

      // Both try to consume 6 concurrently — only one can succeed (10 - 6 = 4 remaining; second needs 6 but only 4 left)
      const results = await Promise.allSettled([
        consumeFromBatch(asServiceClient(client), {
          batchId: inbound.batchId,
          quantity: 6,
        }),
        consumeFromBatch(asServiceClient(client), {
          batchId: inbound.batchId,
          quantity: 6,
        }),
      ]);

      const succeeded = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r) => r.status === "rejected");

      // Exactly one succeeds, one fails with INSUFFICIENT_STOCK
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({
        code: TRANSACTION_ERROR_CODES.INSUFFICIENT_STOCK,
      });

      // Batch quantity must be 4 (not negative)
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(4);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });
});
