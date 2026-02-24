import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  createInboundBatch,
  listStockBatches,
} from "@/lib/transactions/service";

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

async function createTestUser(prefix = "sv") {
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

async function seedItem(orgId: string, userId: string, name?: string) {
  const suffix = randomUUID().slice(0, 8);
  const { data, error } = await adminClient
    .from("items")
    .insert({
      org_id: orgId,
      name: name ?? `TestItem-${suffix}`,
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

describe("listStockBatches integration (UC-08)", () => {
  // AC1/AC2: owner 可列出批次，欄位正確
  it("AC1/AC2: owner lists own batches with correct fields", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId, "急救包");

      await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 5,
        expiryDate: "2028-12-31",
      });

      const batches = await listStockBatches(asServiceClient(client));
      expect(batches.length).toBeGreaterThanOrEqual(1);

      const batch = batches.find((b) => b.itemId === itemId);
      expect(batch).toBeDefined();
      expect(batch!.itemName).toBe("急救包");
      expect(batch!.quantity).toBe(5);
      expect(batch!.expiryDate).toBe("2028-12-31");
      expect(batch!.itemUnit).toBe("個");
      expect(batch!.storageLocationName).toBeNull();
      expect(batch!.tagName).toBeNull();
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC4: viewer 可讀取
  it("AC4: viewer can read stock batches", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId);

      await createInboundBatch(asServiceClient(client), { itemId, quantity: 3 });

      // Downgrade to viewer
      const setViewer = await client
        .from("org_memberships")
        .update({ role: "viewer" })
        .eq("org_id", org.org_id)
        .eq("user_id", user.userId);
      expect(setViewer.error).toBeNull();

      // viewer should be able to list batches
      const batches = await listStockBatches(asServiceClient(client));
      expect(batches.length).toBeGreaterThanOrEqual(1);
      const found = batches.find((b) => b.itemId === itemId);
      expect(found).toBeDefined();
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC5: 跨 org RLS — userB 看不到 userA 的批次
  it("AC5: cross-org: userB cannot see userA batches", async () => {
    const userA = await createTestUser("sva");
    const userB = await createTestUser("svb");
    try {
      const clientA = await signIn(userA.email, userA.password);
      const clientB = await signIn(userB.email, userB.password);
      const orgA = await bootstrap(clientA);
      await bootstrap(clientB);

      const itemId = await seedItem(orgA.org_id, userA.userId);
      await createInboundBatch(asServiceClient(clientA), { itemId, quantity: 10 });

      const batchesForB = await listStockBatches(asServiceClient(clientB));
      const leaked = batchesForB.find((b) => b.itemId === itemId);
      expect(leaked).toBeUndefined();
    } finally {
      await cleanupTestUser(userA.userId);
      await cleanupTestUser(userB.userId);
    }
  });

  // AC3: 搜尋命中
  it("AC3: search by item name returns matching batches", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);

      const matchedId = await seedItem(org.org_id, user.userId, "急救藥品");
      const otherId = await seedItem(org.org_id, user.userId, "飲水儲備");

      await createInboundBatch(asServiceClient(client), { itemId: matchedId, quantity: 2 });
      await createInboundBatch(asServiceClient(client), { itemId: otherId, quantity: 4 });

      const results = await listStockBatches(asServiceClient(client), { q: "急救" });
      expect(results.some((b) => b.itemId === matchedId)).toBe(true);
      expect(results.every((b) => b.itemId !== otherId)).toBe(true);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC3: 搜尋未命中 → 空陣列
  it("AC3: search with no match returns empty array", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId, "飲水儲備");
      await createInboundBatch(asServiceClient(client), { itemId, quantity: 1 });

      const results = await listStockBatches(asServiceClient(client), {
        q: "xyz_notfound_12345",
      });
      expect(results).toHaveLength(0);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC1: empty org → 空陣列
  it("AC1: empty org with no batches returns empty array", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      const results = await listStockBatches(asServiceClient(client));
      expect(results).toHaveLength(0);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // 排序：同品名批次依到期日升冪，null 排最後
  it("batches for same item are sorted by expiry_date ascending (nulls last)", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId, "排序測試品");

      await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 1,
        expiryDate: "2030-06-01",
      });
      await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 1,
        expiryDate: "2029-01-01",
      });
      await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 1,
      });

      const results = await listStockBatches(asServiceClient(client), { q: "排序測試品" });
      expect(results).toHaveLength(3);
      expect(results[0]!.expiryDate).toBe("2029-01-01");
      expect(results[1]!.expiryDate).toBe("2030-06-01");
      expect(results[2]!.expiryDate).toBeNull();
    } finally {
      await cleanupTestUser(user.userId);
    }
  });
});
