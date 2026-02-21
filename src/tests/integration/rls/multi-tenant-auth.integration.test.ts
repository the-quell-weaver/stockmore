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
  const email = `integration.rls.${suffix}@stockmore.local`;
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

describe("multi-tenant RLS (UC_01 AC3)", () => {
  it("blocks cross-org select/insert/update on orgs, warehouses, memberships", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    try {
      const clientA = await signIn(userA.email, userA.password);
      const clientB = await signIn(userB.email, userB.password);

      const bootstrapA = await clientA.rpc("bootstrap_default_org_and_warehouse");
      const bootstrapB = await clientB.rpc("bootstrap_default_org_and_warehouse");
      expect(bootstrapA.error).toBeNull();
      expect(bootstrapB.error).toBeNull();

      const rowA = Array.isArray(bootstrapA.data) ? bootstrapA.data[0] : bootstrapA.data;
      const rowB = Array.isArray(bootstrapB.data) ? bootstrapB.data[0] : bootstrapB.data;
      expect(rowA?.org_id).toBeTruthy();
      expect(rowB?.org_id).toBeTruthy();

      const crossOrgRead = await clientA
        .from("orgs")
        .select("id")
        .eq("id", rowB.org_id);
      expect(crossOrgRead.error).toBeNull();
      expect(crossOrgRead.data).toEqual([]);

      const crossWarehouseRead = await clientA
        .from("warehouses")
        .select("id")
        .eq("org_id", rowB.org_id);
      expect(crossWarehouseRead.error).toBeNull();
      expect(crossWarehouseRead.data).toEqual([]);

      const forgedMembershipInsert = await clientA
        .from("org_memberships")
        .insert({ org_id: rowB.org_id, user_id: userA.userId, role: "owner" });
      expect(forgedMembershipInsert.error).toBeTruthy();
      expect(forgedMembershipInsert.error?.code).toBe("42501");

      const forgedWarehouseInsert = await clientA
        .from("warehouses")
        .insert({ org_id: rowB.org_id, name: "Forged Warehouse", created_by: userA.userId });
      expect(forgedWarehouseInsert.error).toBeTruthy();
      expect(forgedWarehouseInsert.error?.code).toBe("42501");

      const crossOrgUpdate = await clientA
        .from("orgs")
        .update({ name: "hacked" })
        .eq("id", rowB.org_id);
      expect(crossOrgUpdate.error).toBeNull();
      expect(crossOrgUpdate.data).toEqual([]);


      const ownMembershipUpdate = await clientB
        .from("org_memberships")
        .update({ role: "editor" })
        .eq("org_id", rowB.org_id)
        .eq("user_id", userB.userId)
        .select("role")
        .single();
      expect(ownMembershipUpdate.error).toBeNull();
      expect(ownMembershipUpdate.data?.role).toBe("editor");

      const targetMembershipId = await adminClient
        .from("org_memberships")
        .select("id")
        .eq("org_id", rowB.org_id)
        .eq("user_id", userB.userId)
        .single();

      expect(targetMembershipId.error).toBeNull();

      const crossMembershipUpdate = await clientA
        .from("org_memberships")
        .update({ role: "editor" })
        .eq("id", targetMembershipId.data!.id);
      expect(crossMembershipUpdate.error).toBeNull();
      expect(crossMembershipUpdate.data).toEqual([]);
    } finally {
      await adminClient.auth.admin.deleteUser(userA.userId);
      await adminClient.auth.admin.deleteUser(userB.userId);
    }
  });
});
