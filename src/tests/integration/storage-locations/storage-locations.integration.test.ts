import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { LOCATION_ERROR_CODES } from "@/lib/storage-locations/errors";
import {
  createStorageLocation,
  listStorageLocations,
  renameStorageLocation,
} from "@/lib/storage-locations/service";

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

async function createTestUser() {
  const suffix = randomUUID();
  const email = `integration.locations.${suffix}@stockmore.local`;
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
  expect(typedRow?.org_id).toBeTruthy();
  if (!typedRow?.org_id || !typedRow.warehouse_id) {
    throw new Error("Missing org/warehouse id from bootstrap RPC");
  }
  return { org_id: typedRow.org_id, warehouse_id: typedRow.warehouse_id };
}

function asServiceClient(client: Awaited<ReturnType<typeof signIn>>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

describe("storage locations service integration (UC_03)", () => {
  it("allows owner to create and list locations in default warehouse", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      const suffix = randomUUID().slice(0, 8);
      const created = await createStorageLocation(asServiceClient(client), {
        name: `客廳-${suffix}`,
      });

      expect(created.name).toContain("客廳-");

      const listed = await listStorageLocations(asServiceClient(client));
      expect(listed.map((location) => location.id)).toContain(created.id);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("allows owner to rename location and list shows updated name", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);
      const suffix = randomUUID().slice(0, 8);

      const created = await createStorageLocation(asServiceClient(client), {
        name: `玄關-${suffix}`,
      });

      const renamed = await renameStorageLocation(asServiceClient(client), created.id, {
        name: `玄關抽屜-${suffix}`,
      });
      expect(renamed.name).toBe(`玄關抽屜-${suffix}`);

      const listed = await listStorageLocations(asServiceClient(client));
      const same = listed.find((location) => location.id === created.id);
      expect(same?.name).toBe(`玄關抽屜-${suffix}`);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("list returns only current org and default warehouse locations", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const context = await bootstrap(client);
      const suffix = randomUUID().slice(0, 8);

      const inDefaultWarehouse = await createStorageLocation(asServiceClient(client), {
        name: `Default-${suffix}`,
      });

      const otherWarehouse = await adminClient
        .from("warehouses")
        .insert({
          org_id: context.org_id,
          name: `Overflow-${suffix}`,
          is_default: false,
          created_by: user.userId,
        })
        .select("id")
        .single();
      expect(otherWarehouse.error).toBeNull();

      const seededInOtherWarehouse = await adminClient
        .from("storage_locations")
        .insert({
          org_id: context.org_id,
          warehouse_id: otherWarehouse.data!.id,
          name: `Other-${suffix}`,
          created_by: user.userId,
          updated_by: user.userId,
        })
        .select("id")
        .single();
      expect(seededInOtherWarehouse.error).toBeNull();

      const listed = await listStorageLocations(asServiceClient(client));
      const ids = listed.map((location) => location.id);

      expect(ids).toContain(inDefaultWarehouse.id);
      expect(ids).not.toContain(seededInOtherWarehouse.data!.id);
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("blocks viewer create and rename (FORBIDDEN)", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      const context = await bootstrap(client);
      const suffix = randomUUID().slice(0, 8);

      const seeded = await adminClient
        .from("storage_locations")
        .insert({
          org_id: context.org_id,
          warehouse_id: context.warehouse_id,
          name: `ViewerSeed-${suffix}`,
          created_by: user.userId,
          updated_by: user.userId,
        })
        .select("id")
        .single();
      expect(seeded.error).toBeNull();

      const setViewer = await client
        .from("org_memberships")
        .update({ role: "viewer" })
        .eq("org_id", context.org_id)
        .eq("user_id", user.userId);
      expect(setViewer.error).toBeNull();

      await expect(
        createStorageLocation(asServiceClient(client), {
          name: `Blocked-${suffix}`,
        }),
      ).rejects.toMatchObject({
        code: LOCATION_ERROR_CODES.FORBIDDEN,
      });

      await expect(
        renameStorageLocation(asServiceClient(client), seeded.data!.id, {
          name: `Blocked-Rename-${suffix}`,
        }),
      ).rejects.toMatchObject({
        code: LOCATION_ERROR_CODES.FORBIDDEN,
      });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("rejects duplicate create and duplicate rename (LOCATION_NAME_CONFLICT)", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);
      const suffix = randomUUID().slice(0, 8);

      const first = await createStorageLocation(asServiceClient(client), {
        name: `廚房-${suffix}`,
      });
      await createStorageLocation(asServiceClient(client), {
        name: `客廳-${suffix}`,
      });

      await expect(
        createStorageLocation(asServiceClient(client), {
          name: `廚房-${suffix}`.toUpperCase(),
        }),
      ).rejects.toMatchObject({
        code: LOCATION_ERROR_CODES.LOCATION_NAME_CONFLICT,
      });

      await expect(
        renameStorageLocation(asServiceClient(client), first.id, {
          name: `客廳-${suffix}`,
        }),
      ).rejects.toMatchObject({
        code: LOCATION_ERROR_CODES.LOCATION_NAME_CONFLICT,
      });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("returns LOCATION_NOT_FOUND when renaming non-existent location", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      await expect(
        renameStorageLocation(asServiceClient(client), randomUUID(), {
          name: "不存在",
        }),
      ).rejects.toMatchObject({
        code: LOCATION_ERROR_CODES.LOCATION_NOT_FOUND,
      });
    } finally {
      await cleanupTestUser(user.userId);
    }
  });

  it("enforces cross-org isolation on list and insert", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    try {
      const clientA = await signIn(userA.email, userA.password);
      const clientB = await signIn(userB.email, userB.password);
      const orgA = await bootstrap(clientA);
      await bootstrap(clientB);
      const suffix = randomUUID().slice(0, 8);

      const seeded = await adminClient
        .from("storage_locations")
        .insert({
          org_id: orgA.org_id,
          warehouse_id: orgA.warehouse_id,
          name: `OrgA-${suffix}`,
          created_by: userA.userId,
          updated_by: userA.userId,
        })
        .select("id")
        .single();
      expect(seeded.error).toBeNull();

      const listB = await listStorageLocations(asServiceClient(clientB));
      expect(listB).toEqual([]);

      const crossInsert = await clientB.from("storage_locations").insert({
        org_id: orgA.org_id,
        warehouse_id: orgA.warehouse_id,
        name: `Cross-${suffix}`,
        created_by: userB.userId,
        updated_by: userB.userId,
      });
      expect(crossInsert.error?.code).toBe("42501");
    } finally {
      await cleanupTestUser(userA.userId);
      await cleanupTestUser(userB.userId);
    }
  });
});
