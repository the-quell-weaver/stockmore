import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
  const email = `integration.${suffix}@stockmore.local`;
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

async function deleteTestUser(userId: string) {
  await adminClient.auth.admin.deleteUser(userId);
}

describe("bootstrap_default_org_and_warehouse (integration)", () => {
  it("creates org/warehouse/membership and is idempotent", async () => {
    const { userId, email, password } = await createTestUser();
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
      const { data: signInData, error: signInError } =
        await userClient.auth.signInWithPassword({
          email,
          password,
        });
      if (signInError) throw signInError;
      if (!signInData?.session) {
        throw new Error("Missing session after sign-in");
      }

      const authedClient = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          headers: {
            Authorization: `Bearer ${signInData.session.access_token}`,
          },
        },
      });

      const first = await authedClient.rpc(
        "bootstrap_default_org_and_warehouse",
      );
      expect(first.error).toBeNull();
      const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
      expect(firstRow?.org_id).toBeTruthy();
      expect(firstRow?.warehouse_id).toBeTruthy();

      const second = await authedClient.rpc(
        "bootstrap_default_org_and_warehouse",
      );
      expect(second.error).toBeNull();
      const secondRow = Array.isArray(second.data) ? second.data[0] : second.data;
      expect(secondRow?.org_id).toBe(firstRow.org_id);
      expect(secondRow?.warehouse_id).toBe(firstRow.warehouse_id);

      const { data: orgs } = await adminClient
        .from("orgs")
        .select("id, owner_user_id")
        .eq("owner_user_id", userId);
      expect(orgs?.length).toBe(1);
      expect(orgs?.[0]?.id).toBe(firstRow.org_id);

      const { data: memberships } = await adminClient
        .from("org_memberships")
        .select("id, org_id, user_id")
        .eq("user_id", userId);
      expect(memberships?.length).toBe(1);
      expect(memberships?.[0]?.org_id).toBe(firstRow.org_id);

      const { data: warehouses } = await adminClient
        .from("warehouses")
        .select("id, org_id, is_default")
        .eq("org_id", firstRow.org_id);
      expect(warehouses?.length).toBe(1);
      expect(warehouses?.[0]?.id).toBe(firstRow.warehouse_id);
    } finally {
      await deleteTestUser(userId);
    }
  });
});
