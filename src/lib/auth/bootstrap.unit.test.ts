import { describe, expect, it, vi } from "vitest";

import {
  bootstrapDefaultOrgAndWarehouse,
  BootstrapError,
} from "@/lib/auth/bootstrap";

const makeSupabase = () => ({
  auth: {
    getUser: vi.fn(),
  },
  rpc: vi.fn(),
});

describe("bootstrapDefaultOrgAndWarehouse", () => {
  it("returns org/warehouse ids when bootstrap succeeds", async () => {
    const supabase = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    supabase.rpc.mockResolvedValue({
      data: { org_id: "org-1", warehouse_id: "wh-1" },
      error: null,
    });

    const result = await bootstrapDefaultOrgAndWarehouse(
      supabase as unknown as any,
    );

    expect(result).toEqual({ orgId: "org-1", warehouseId: "wh-1" });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "bootstrap_default_org_and_warehouse",
    );
  });

  it("returns existing ids on repeated concurrent calls", async () => {
    const supabase = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    supabase.rpc.mockResolvedValue({
      data: [{ org_id: "org-1", warehouse_id: "wh-1" }],
      error: null,
    });

    const [first, second] = await Promise.all([
      bootstrapDefaultOrgAndWarehouse(supabase as unknown as any),
      bootstrapDefaultOrgAndWarehouse(supabase as unknown as any),
    ]);

    expect(first).toEqual({ orgId: "org-1", warehouseId: "wh-1" });
    expect(second).toEqual({ orgId: "org-1", warehouseId: "wh-1" });
  });

  it("throws BOOTSTRAP_FAILED when user is missing", async () => {
    const supabase = makeSupabase();
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(
      bootstrapDefaultOrgAndWarehouse(supabase as unknown as any),
    ).rejects.toBeInstanceOf(BootstrapError);
  });
});
