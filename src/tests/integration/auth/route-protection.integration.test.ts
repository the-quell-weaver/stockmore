import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_ERROR_CODES } from "@/lib/auth/errors";
import { updateSession } from "@/lib/supabase/proxy";
import { requireUser } from "@/lib/auth/require-user";

const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser,
    },
  })),
}));

vi.mock("@/lib/utils", () => ({
  hasEnvVars: true,
}));

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("route protection", () => {
  beforeEach(() => {
    getUser.mockReset();
    redirectMock.mockReset();
  });

  it("redirects unauthenticated /stock request to /login with next", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const request = new NextRequest("http://localhost/stock");
    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost/login?error=${AUTH_ERROR_CODES.AUTH_REQUIRED}&next=%2Fstock`,
    );
  });

  it("allows authenticated /stock request", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const request = new NextRequest("http://localhost/stock");
    const response = await updateSession(request);

    expect(response.status).toBe(200);
  });

  it("requireUser redirects when no authenticated user exists", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    };

    await requireUser(supabase as never, "/stock");

    expect(redirectMock).toHaveBeenCalledWith(
      `/login?error=${AUTH_ERROR_CODES.AUTH_REQUIRED}&next=%2Fstock`,
    );
  });
});
