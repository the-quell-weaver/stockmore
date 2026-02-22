import { describe, expect, it, vi } from "vitest";

import { AUTH_ERROR_CODES, getAuthErrorMessage } from "@/lib/auth/errors";
import { signInWithPasswordAndBootstrap } from "@/lib/auth/password-login";

const makeSupabase = () => ({
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  rpc: vi.fn(),
});

describe("signInWithPasswordAndBootstrap", () => {
  it("signs in and bootstraps successfully", async () => {
    const supabase = makeSupabase();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });
    supabase.rpc.mockResolvedValue({
      data: { org_id: "org-1", warehouse_id: "wh-1" },
      error: null,
    });

    await expect(
      signInWithPasswordAndBootstrap(supabase, {
        email: "  user@example.com ",
        password: "secret",
      }),
    ).resolves.toBeUndefined();

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret",
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "bootstrap_default_org_and_warehouse",
    );
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("throws original sign-in error and skips bootstrap", async () => {
    const supabase = makeSupabase();
    const signInError = new Error("Invalid login credentials");
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: signInError,
    });

    await expect(
      signInWithPasswordAndBootstrap(supabase, {
        email: "user@example.com",
        password: "wrong",
      }),
    ).rejects.toThrow("Invalid login credentials");

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out local session and throws generic bootstrap error when rpc fails", async () => {
    const supabase = makeSupabase();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });
    supabase.rpc.mockResolvedValue({
      data: null,
      error: new Error("rpc failed"),
    });
    supabase.auth.signOut.mockResolvedValue({ error: null });

    await expect(
      signInWithPasswordAndBootstrap(supabase, {
        email: "user@example.com",
        password: "secret",
      }),
    ).rejects.toThrow(getAuthErrorMessage(AUTH_ERROR_CODES.BOOTSTRAP_FAILED));

    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("signs out local session when rpc returns empty org/warehouse", async () => {
    const supabase = makeSupabase();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    });
    supabase.rpc.mockResolvedValue({
      data: { org_id: "org-1", warehouse_id: "" },
      error: null,
    });
    supabase.auth.signOut.mockResolvedValue({ error: null });

    await expect(
      signInWithPasswordAndBootstrap(supabase, {
        email: "user@example.com",
        password: "secret",
      }),
    ).rejects.toThrow(getAuthErrorMessage(AUTH_ERROR_CODES.BOOTSTRAP_FAILED));

    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
