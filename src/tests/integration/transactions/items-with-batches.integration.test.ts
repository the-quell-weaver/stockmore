import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  createInboundBatch,
  listItemsWithBatches,
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

async function createTestUser(prefix = "iwb") {
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

async function seedItem(orgId: string, userId: string, name: string) {
  const { data, error } = await adminClient
    .from("items")
    .insert({
      org_id: orgId,
      name,
      unit: "個",
      min_stock: 0,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Failed to seed item");
  return data.id as string;
}

function asServiceClient(client: Awaited<ReturnType<typeof signIn>>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

describe("listItemsWithBatches (UC-11 restock mode)", () => {
  it("includes items with no batches as items with empty batches array", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const suffix = randomUUID().slice(0, 6);
      const noBatchItemId = await seedItem(org.org_id, user.userId, `無批次品項-${suffix}`);
      const withBatchItemId = await seedItem(org.org_id, user.userId, `有批次品項-${suffix}`);

      await createInboundBatch(asServiceClient(client), {
        itemId: withBatchItemId,
        quantity: 5,
      });

      const items = await listItemsWithBatches(asServiceClient(client));

      const noBatch = items.find((i) => i.id === noBatchItemId)!;
      expect(noBatch).toBeDefined();
      expect(noBatch.batches).toHaveLength(0);

      const withBatch = items.find((i) => i.id === withBatchItemId)!;
      expect(withBatch).toBeDefined();
      expect(withBatch.batches).toHaveLength(1);
      expect(withBatch.batches[0].quantity).toBe(5);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("groups multiple batches under the same item", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client);
      const itemId = await seedItem(org.org_id, user.userId, `多批次品項-${randomUUID().slice(0, 6)}`);

      await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 3,
        expiryDate: "2028-01-01",
      });
      await createInboundBatch(asServiceClient(client), {
        itemId,
        quantity: 7,
        expiryDate: "2029-01-01",
      });

      const items = await listItemsWithBatches(asServiceClient(client));
      const item = items.find((i) => i.id === itemId)!;
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
      const uniqueName = `Org1Only-${randomUUID().slice(0, 8)}`;
      await seedItem(org1.org_id, user1.userId, uniqueName);

      const client2 = await signIn(user2.email, user2.password);
      await bootstrap(client2);

      const items = await listItemsWithBatches(asServiceClient(client2));
      expect(items.find((i) => i.name === uniqueName)).toBeUndefined();
    } finally {
      await cleanupTestUser(user1.userId);
      await cleanupTestUser(user2.userId);
    }
  });
});
