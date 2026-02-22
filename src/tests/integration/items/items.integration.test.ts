import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ITEM_ERROR_CODES } from "@/lib/items/errors";
import { createItem, listItems, updateItem } from "@/lib/items/service";

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
  const email = `integration.items.${suffix}@stockmore.local`;
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

describe("items service integration (UC_02)", () => {
  it("allows owner to create, update, list, and soft-delete items", async () => {
    const user = await createTestUser();

    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);

      const suffix = randomUUID().slice(0, 8);
      const created = await createItem(asServiceClient(client), {
        name: `Water-${suffix}`,
        unit: "bottle",
        minStock: 3,
        note: "initial",
      });

      expect(created.name).toContain("Water-");
      expect(created.minStock).toBe(3);

      const updated = await updateItem(asServiceClient(client), created.id, {
        minStock: 5,
        note: "updated",
      });
      expect(updated.minStock).toBe(5);
      expect(updated.note).toBe("updated");

      const visible = await listItems(asServiceClient(client));
      expect(visible.map((item) => item.id)).toContain(created.id);

      await updateItem(asServiceClient(client), created.id, { isDeleted: true });

      const activeOnly = await listItems(asServiceClient(client));
      expect(activeOnly.map((item) => item.id)).not.toContain(created.id);

      const withDeleted = await listItems(asServiceClient(client), { includeDeleted: true });
      const deleted = withDeleted.find((item) => item.id === created.id);
      expect(deleted?.isDeleted).toBe(true);
    } finally {
      await adminClient.auth.admin.deleteUser(user.userId);
    }
  });

  it("blocks viewer write and cross-org reads", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    try {
      const clientA = await signIn(userA.email, userA.password);
      const clientB = await signIn(userB.email, userB.password);

      const orgA = await bootstrap(clientA);
      const orgB = await bootstrap(clientB);

      const setViewer = await clientB
        .from("org_memberships")
        .update({ role: "viewer" })
        .eq("org_id", orgB.org_id)
        .eq("user_id", userB.userId);
      expect(setViewer.error).toBeNull();

      await expect(
        createItem(asServiceClient(clientB), {
          name: `Viewer-Blocked-${randomUUID().slice(0, 6)}`,
          unit: "box",
          minStock: 1,
        }),
      ).rejects.toMatchObject({
        code: ITEM_ERROR_CODES.FORBIDDEN,
      });

      const seeded = await adminClient
        .from("items")
        .insert({
          org_id: orgB.org_id,
          name: `OrgB-${randomUUID().slice(0, 6)}`,
          unit: "pack",
          min_stock: 1,
          created_by: userB.userId,
          updated_by: userB.userId,
        })
        .select("id")
        .single();
      expect(seeded.error).toBeNull();

      const crossRead = await clientA
        .from("items")
        .select("id")
        .eq("org_id", orgB.org_id)
        .eq("id", seeded.data!.id);
      expect(crossRead.error).toBeNull();
      expect(crossRead.data).toEqual([]);

      const ownOrgRead = await clientA
        .from("items")
        .select("id")
        .eq("org_id", orgA.org_id);
      expect(ownOrgRead.error).toBeNull();
    } finally {
      await adminClient.auth.admin.deleteUser(userA.userId);
      await adminClient.auth.admin.deleteUser(userB.userId);
    }
  });

  it("rejects duplicate item name in same org (ITEM_NAME_CONFLICT)", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);
      const suffix = randomUUID().slice(0, 8);
      const name = `Dup-${suffix}`;

      await createItem(asServiceClient(client), { name, unit: "pcs", minStock: 0 });

      await expect(
        createItem(asServiceClient(client), { name, unit: "box", minStock: 0 }),
      ).rejects.toMatchObject({ code: ITEM_ERROR_CODES.ITEM_NAME_CONFLICT });
    } finally {
      await adminClient.auth.admin.deleteUser(user.userId);
    }
  });

  it("returns ITEM_NOT_FOUND when updating non-existent item", async () => {
    const user = await createTestUser();
    try {
      const client = await signIn(user.email, user.password);
      await bootstrap(client);
      const nonExistentId = randomUUID();

      await expect(
        updateItem(asServiceClient(client), nonExistentId, { note: "ghost" }),
      ).rejects.toMatchObject({ code: ITEM_ERROR_CODES.ITEM_NOT_FOUND });
    } finally {
      await adminClient.auth.admin.deleteUser(user.userId);
    }
  });
});
