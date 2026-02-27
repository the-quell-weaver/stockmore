import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { TRANSACTION_ERROR_CODES } from "@/lib/transactions/errors";
import {
  adjustBatchQuantity,
  createInboundBatch,
} from "@/lib/transactions/service";

// ── env loading ──────────────────────────────────────────────────────────────

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

// ── helpers ──────────────────────────────────────────────────────────────────

async function createTestUser(prefix = "adjust") {
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
      name: `AdjustItem-${suffix}`,
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

// ── tests ────────────────────────────────────────────────────────────────────

describe("adjustBatchQuantity integration (UC_07)", () => {
  // AC1: owner adjusts 10 → 8; batch becomes 8, 1 adjustment transaction produced
  it("AC1: owner can adjust batch from 10 to 8", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      // Inbound: create batch with quantity=10
      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });
      expect(inbound.batchQuantity).toBe(10);

      // Adjust to actual quantity=8
      const result = await adjustBatchQuantity(asServiceClient(client), {
        batchId: inbound.batchId,
        actualQuantity: 8,
        note: "recount after inspection",
        idempotencyKey: randomUUID(),
      });

      expect(result.batchId).toBe(inbound.batchId);
      expect(result.transactionId).toBeTruthy();
      expect(result.batchQuantity).toBe(8);

      // Verify batch row
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(8);

      // Verify transaction row
      const { data: txns } = await adminClient
        .from("transactions")
        .select("type, quantity_delta, quantity_after, note")
        .eq("batch_id", inbound.batchId)
        .eq("type", "adjustment");
      expect(txns).toHaveLength(1);
      const txn = txns![0];
      expect(txn.type).toBe("adjustment");
      expect(Number(txn.quantity_delta)).toBe(-2); // 8 - 10 = -2
      expect(Number(txn.quantity_after)).toBe(8);
      expect(txn.note).toBe("recount after inspection");
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC1 variant: upward adjustment (delta positive)
  it("AC1 variant: owner can adjust batch upward from 5 to 12", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 5,
      });

      const result = await adjustBatchQuantity(asServiceClient(client), {
        batchId: inbound.batchId,
        actualQuantity: 12,
        idempotencyKey: randomUUID(),
      });

      expect(result.batchQuantity).toBe(12);

      // Verify delta is positive
      const { data: txns } = await adminClient
        .from("transactions")
        .select("quantity_delta, quantity_after")
        .eq("batch_id", inbound.batchId)
        .eq("type", "adjustment");
      expect(txns).toHaveLength(1);
      expect(Number(txns![0].quantity_delta)).toBe(7); // 12 - 5 = 7
      expect(Number(txns![0].quantity_after)).toBe(12);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC1 variant: decimal actualQuantity
  it("AC1 variant: owner can adjust to decimal quantity (4.5)", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 10,
      });

      const result = await adjustBatchQuantity(asServiceClient(client), {
        batchId: inbound.batchId,
        actualQuantity: 4.5,
        idempotencyKey: randomUUID(),
      });

      expect(result.batchQuantity).toBe(4.5);

      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(4.5);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC2: adjust to 0 is allowed; transaction record preserved
  it("AC2: owner can adjust batch quantity to 0", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 5,
      });

      const result = await adjustBatchQuantity(asServiceClient(client), {
        batchId: inbound.batchId,
        actualQuantity: 0,
        note: "all items expired",
        idempotencyKey: randomUUID(),
      });

      expect(result.batchQuantity).toBe(0);

      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(0);

      // Transaction preserved (not deleted)
      const { data: txns } = await adminClient
        .from("transactions")
        .select("type, quantity_after")
        .eq("batch_id", inbound.batchId)
        .eq("type", "adjustment");
      expect(txns).toHaveLength(1);
      expect(Number(txns![0].quantity_after)).toBe(0);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC3: viewer is rejected with FORBIDDEN
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
        adjustBatchQuantity(asServiceClient(client), {
          batchId: inbound.batchId,
          actualQuantity: 8,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.FORBIDDEN });

      // Batch quantity unchanged
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(10);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC4: negative actualQuantity → QUANTITY_INVALID (service layer, before DB)
  it("AC4: negative actualQuantity throws QUANTITY_INVALID before DB", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      await expect(
        adjustBatchQuantity(asServiceClient(client), {
          batchId: randomUUID(),
          actualQuantity: -1,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC4: NaN → QUANTITY_INVALID
  it("AC4: NaN actualQuantity throws QUANTITY_INVALID before DB", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      await expect(
        adjustBatchQuantity(asServiceClient(client), {
          batchId: randomUUID(),
          actualQuantity: NaN,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC5: duplicate submission with same idempotencyKey → only 1 transaction produced
  it("AC5: duplicate submission with same idempotencyKey is idempotent", async () => {
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

      const first = await adjustBatchQuantity(asServiceClient(client), {
        batchId: inbound.batchId,
        actualQuantity: 8,
        idempotencyKey: key,
      });

      // Second call with same key
      const second = await adjustBatchQuantity(asServiceClient(client), {
        batchId: inbound.batchId,
        actualQuantity: 8,
        idempotencyKey: key,
      });

      expect(second.transactionId).toBe(first.transactionId);
      expect(second.batchId).toBe(first.batchId);

      // Only 1 adjustment transaction in DB
      const { data: txns } = await adminClient
        .from("transactions")
        .select("id, type")
        .eq("batch_id", inbound.batchId)
        .eq("type", "adjustment");
      expect(txns).toHaveLength(1);

      // Batch quantity set only once (10 → 8)
      const { data: batch } = await adminClient
        .from("batches")
        .select("quantity")
        .eq("id", inbound.batchId)
        .single();
      expect(Number(batch?.quantity)).toBe(8);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // Cross-org: cannot adjust another org's batch → BATCH_NOT_FOUND
  it("cross-org: cannot adjust another org's batch", async () => {
    const userA = await createTestUser("adjusta");
    const userB = await createTestUser("adjustb");
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

      // User B tries to adjust org A's batch
      await expect(
        adjustBatchQuantity(asServiceClient(clientB), {
          batchId: batchA.batchId,
          actualQuantity: 5,
          idempotencyKey: randomUUID(),
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

  // Non-existent batch → BATCH_NOT_FOUND
  it("adjusting a non-existent batch throws BATCH_NOT_FOUND", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      await expect(
        adjustBatchQuantity(asServiceClient(client), {
          batchId: randomUUID(), // random UUID that doesn't exist
          actualQuantity: 5,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: TRANSACTION_ERROR_CODES.BATCH_NOT_FOUND });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // quantity_after is stored correctly alongside quantity_delta
  it("stores both quantity_delta and quantity_after on the transaction", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      const inbound = await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 20,
      });

      await adjustBatchQuantity(asServiceClient(client), {
        batchId: inbound.batchId,
        actualQuantity: 15,
        note: "test delta",
        idempotencyKey: randomUUID(),
      });

      const { data: txns } = await adminClient
        .from("transactions")
        .select("quantity_delta, quantity_after")
        .eq("batch_id", inbound.batchId)
        .eq("type", "adjustment");

      expect(txns).toHaveLength(1);
      expect(Number(txns![0].quantity_delta)).toBe(-5); // 15 - 20 = -5
      expect(Number(txns![0].quantity_after)).toBe(15);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });
});
