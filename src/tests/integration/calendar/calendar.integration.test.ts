/**
 * Integration tests for UC-09 Expiry Calendar Export.
 *
 * Tests the service-layer pipeline: DB → listStockBatches → buildExpiryIcs.
 * Does not require a running dev server; tests functions directly.
 *
 * Verifies:
 * - AC1: Batches with expiry_date → valid VEVENT with correct fields
 * - AC2: UID stability across multiple calls
 * - AC3: Batches without expiry_date → no VEVENT generated
 * - AC4: Org isolation — User B's batches not visible to User A's service call
 * - AC5: All event fields traceable to data source
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  buildExpiryIcs,
  buildEventUid,
  REMINDER_OFFSETS_DAYS,
} from "@/lib/calendar/ics-builder";
import { listStockBatches } from "@/lib/transactions/service";

// ---------------------------------------------------------------------------
// Env loading (copied from existing integration test pattern)
// ---------------------------------------------------------------------------

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
      if (!process.env[key]) process.env[key] = value;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestUser(prefix = "calendar") {
  const suffix = randomUUID();
  const email = `integration.${prefix}.${suffix}@stockmore.local`;
  const password = `Password!${suffix.replace(/-/g, "")}`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Failed to create test user");
  return { userId: data.user.id, email, password };
}

async function cleanupTestUser(userId: string) {
  const memberships = await adminClient
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId);
  const orgIds = Array.from(
    new Set(
      (memberships.data ?? []).map((r) => r.org_id).filter(Boolean),
    ),
  );
  if (orgIds.length > 0) {
    await adminClient.from("orgs").delete().in("id", orgIds);
  }
  await adminClient.auth.admin.deleteUser(userId);
}

async function signIn(email: string, password: string) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("Failed to sign in");
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

async function bootstrap(client: SupabaseClient) {
  const result = await client.rpc("bootstrap_default_org_and_warehouse");
  expect(result.error).toBeNull();
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const typedRow = row as { org_id?: string; warehouse_id?: string } | null;
  if (!typedRow?.org_id || !typedRow.warehouse_id) {
    throw new Error("Missing org/warehouse from bootstrap RPC");
  }
  return { org_id: typedRow.org_id, warehouse_id: typedRow.warehouse_id };
}

async function seedItem(orgId: string, userId: string, suffix = "") {
  const name = `CalItem-${suffix || randomUUID().slice(0, 8)}`;
  const { data, error } = await adminClient
    .from("items")
    .insert({ org_id: orgId, name, unit: "個", min_stock: 0, created_by: userId, updated_by: userId })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

async function seedBatch(
  orgId: string,
  warehouseId: string,
  itemId: string,
  userId: string,
  expiryDate: string | null,
  quantity = 10,
) {
  const { data, error } = await adminClient
    .from("batches")
    .insert({
      org_id: orgId,
      warehouse_id: warehouseId,
      item_id: itemId,
      quantity,
      expiry_date: expiryDate,
      created_by: userId,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Calendar Export integration (UC-09)", () => {
  // AC1 + AC5: batches with expiry_date generate correct VEVENT fields
  it("AC1/AC5: batches with expiry_date → valid VCALENDAR with correct VEVENT fields", async () => {
    const user = await createTestUser("ac1");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client as unknown as SupabaseClient);
      const itemId = await seedItem(org.org_id, user.userId);
      const batchId = await seedBatch(
        org.org_id,
        org.warehouse_id,
        itemId,
        user.userId,
        "2030-06-30",
        50,
      );

      const batches = await listStockBatches(client as unknown as SupabaseClient, { limit: 200 });
      const ics = buildExpiryIcs(batches);

      // Valid VCALENDAR wrapper
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).toContain("VERSION:2.0");

      // At least 3 VEVENTs for the batch (one per offset)
      const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
      expect(count).toBe(3);

      // Each offset generates a VEVENT with correct DTSTART
      // 2030-06-30 - 30 = 2030-05-31 → 20300531
      expect(ics).toContain("DTSTART;VALUE=DATE:20300531");
      // 2030-06-30 - 7 = 2030-06-23 → 20300623
      expect(ics).toContain("DTSTART;VALUE=DATE:20300623");
      // 2030-06-30 - 1 = 2030-06-29 → 20300629
      expect(ics).toContain("DTSTART;VALUE=DATE:20300629");

      // DESCRIPTION contains expiry date and quantity (AC5)
      expect(ics).toContain("到期日：2030-06-30");
      expect(ics).toContain("50 個");

      // UID contains batch id and offset (AC5)
      for (const offset of REMINDER_OFFSETS_DAYS) {
        expect(ics).toContain(`UID:${buildEventUid(batchId, offset)}`);
      }
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC2: UID stability — same batch generates same UID across calls
  it("AC2: same batch produces identical UIDs across multiple export calls", async () => {
    const user = await createTestUser("ac2");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client as unknown as SupabaseClient);
      const itemId = await seedItem(org.org_id, user.userId);
      await seedBatch(org.org_id, org.warehouse_id, itemId, user.userId, "2030-12-31");

      const sc = client as unknown as SupabaseClient;
      const batches1 = await listStockBatches(sc, { limit: 200 });
      const batches2 = await listStockBatches(sc, { limit: 200 });

      const ics1 = buildExpiryIcs(batches1);
      const ics2 = buildExpiryIcs(batches2);

      const extractUids = (s: string) =>
        [...s.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]?.trim()).sort();

      expect(extractUids(ics1)).toEqual(extractUids(ics2));
      expect(extractUids(ics1)).toHaveLength(3); // 3 offsets
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC3: Batches without expiry_date → no VEVENT
  it("AC3: batches without expiry_date are excluded from the calendar", async () => {
    const user = await createTestUser("ac3");
    try {
      const client = await signIn(user.email, user.password);
      const org = await bootstrap(client as unknown as SupabaseClient);
      const itemId = await seedItem(org.org_id, user.userId);
      // Seed batch with NULL expiry_date
      await seedBatch(org.org_id, org.warehouse_id, itemId, user.userId, null, 20);

      const batches = await listStockBatches(client as unknown as SupabaseClient, { limit: 200 });
      const ics = buildExpiryIcs(batches);

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).not.toContain("BEGIN:VEVENT");
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // AC4: Empty org → valid empty VCALENDAR
  it("AC4: org with no expiring batches returns a valid empty VCALENDAR", async () => {
    const user = await createTestUser("ac4");
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client as unknown as SupabaseClient);

      const batches = await listStockBatches(client as unknown as SupabaseClient, { limit: 200 });
      const ics = buildExpiryIcs(batches);

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).not.toContain("BEGIN:VEVENT");
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  // Org isolation: User B cannot see User A's batches
  it("Org isolation: User B's listStockBatches call does not return User A's batches", async () => {
    const userA = await createTestUser("orgiso-a");
    const userB = await createTestUser("orgiso-b");
    try {
      const clientA = await signIn(userA.email, userA.password);
      const orgA = await bootstrap(clientA as unknown as SupabaseClient);
      const itemIdA = await seedItem(orgA.org_id, userA.userId);
      const batchIdA = await seedBatch(
        orgA.org_id,
        orgA.warehouse_id,
        itemIdA,
        userA.userId,
        "2031-01-01",
        99,
      );

      const clientB = await signIn(userB.email, userB.password);
      await bootstrap(clientB as unknown as SupabaseClient);

      // User B fetches batches — should NOT contain User A's batch
      const batchesB = await listStockBatches(clientB as unknown as SupabaseClient, { limit: 200 });
      const batchIdsBB = batchesB.map((b) => b.id);
      expect(batchIdsBB).not.toContain(batchIdA);

      // User B's ICS should not contain User A's batch UID
      const icsB = buildExpiryIcs(batchesB);
      expect(icsB).not.toContain(batchIdA);
    } finally {
      await cleanupTestUser(userA.userId);
      await cleanupTestUser(userB.userId);
    }
  });

  // Auth failure: unauthenticated client → getAuthContext returns null
  it("Unauthenticated client: getAuthContext returns null (maps to 401 in route handler)", async () => {
    // Dynamically import to avoid issues in environments without Next.js context
    const { getAuthContext } = await import("@/lib/auth/context");

    // Anonymous (no credentials) Supabase client
    const anonSupabase = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const context = await getAuthContext(anonSupabase as unknown as import("@supabase/supabase-js").SupabaseClient);
    expect(context).toBeNull();
  });
});
