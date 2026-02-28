import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { bootstrapDefaultOrgAndWarehouse } from "@/lib/auth/bootstrap";
import { seedDemoData } from "@/lib/demo/seed-demo-data";
import { SEED_ITEMS } from "@/lib/demo/seed-fixture";
import { listItems } from "@/lib/items/service";

// ── ENV LOADING ──────────────────────────────────────────────────────────────
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

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

loadEnvFiles();

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function signInAnonymously() {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) throw error ?? new Error("Anonymous sign-in failed");

  return {
    client: createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      },
    }),
    userId: data.user!.id,
  };
}

async function cleanupAnonUser(userId: string) {
  const { data: memberships } = await adminClient
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId);
  const orgIds = (memberships ?? []).map((r) => r.org_id).filter(Boolean);
  if (orgIds.length > 0) {
    await adminClient.from("orgs").delete().in("id", orgIds);
  }
  await adminClient.auth.admin.deleteUser(userId);
}

describe("seedDemoData integration (UC-13)", () => {
  it("seeds items and batches from fixture after anonymous bootstrap", async () => {
    const { client, userId } = await signInAnonymously();
    try {
      await bootstrapDefaultOrgAndWarehouse(client);
      const result = await seedDemoData(client);

      expect(result).toEqual({ ok: true });

      const items = await listItems(client);
      expect(items).toHaveLength(SEED_ITEMS.length);
      expect(items.map((i) => i.name)).toEqual(
        expect.arrayContaining(SEED_ITEMS.map((s) => s.name)),
      );
    } finally {
      await cleanupAnonUser(userId);
    }
  });

  it("is idempotent: calling seedDemoData twice does not create duplicate items", async () => {
    const { client, userId } = await signInAnonymously();
    try {
      await bootstrapDefaultOrgAndWarehouse(client);
      await seedDemoData(client);
      await seedDemoData(client); // second call must be a no-op

      const items = await listItems(client);
      expect(items).toHaveLength(SEED_ITEMS.length);
    } finally {
      await cleanupAnonUser(userId);
    }
  });

  it("RLS: demo org data is invisible to other anonymous users (cross-org isolation)", async () => {
    const { client: clientA, userId: userIdA } = await signInAnonymously();
    const { client: clientB, userId: userIdB } = await signInAnonymously();
    try {
      const { orgId: orgIdA } = await bootstrapDefaultOrgAndWarehouse(clientA);
      await bootstrapDefaultOrgAndWarehouse(clientB);
      await seedDemoData(clientA);

      // User B has their own empty org; should see zero items
      const itemsB = await listItems(clientB);
      expect(itemsB).toHaveLength(0);

      // Direct RLS check: User B cannot read User A's org data
      const crossRead = await clientB
        .from("items")
        .select("id")
        .eq("org_id", orgIdA);
      expect(crossRead.error).toBeNull();
      expect(crossRead.data).toEqual([]);
    } finally {
      await cleanupAnonUser(userIdA);
      await cleanupAnonUser(userIdB);
    }
  });
});
