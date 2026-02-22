import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { AUTH_ERROR_CODES } from "../../../lib/auth/errors";
import { GET } from "./route";

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const { bootstrapDefaultOrgAndWarehouse } = vi.hoisted(() => ({
  bootstrapDefaultOrgAndWarehouse: vi.fn(),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createRouteHandlerClient: vi.fn(() => ({
    supabase: {
      auth: {
        verifyOtp,
        exchangeCodeForSession,
      },
    },
    finalizeResponse: <T>(response: T) => response,
  })),
}));

vi.mock("../../../lib/auth/bootstrap", () => ({
  bootstrapDefaultOrgAndWarehouse,
}));

beforeEach(() => {
  verifyOtp.mockReset();
  exchangeCodeForSession.mockReset();
  bootstrapDefaultOrgAndWarehouse.mockReset();
  bootstrapDefaultOrgAndWarehouse.mockResolvedValue({
    orgId: "org-1",
    warehouseId: "wh-1",
  });
});

describe("/auth/callback", () => {
  it("redirects to next on valid token", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const request = new NextRequest(
      "http://localhost/auth/callback?token_hash=token&type=magiclink&next=/stock",
    );

    const response = await GET(request);

    expect(verifyOtp).toHaveBeenCalledOnce();
    expect(bootstrapDefaultOrgAndWarehouse).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/stock");
  });

  it("redirects to login with error on invalid token", async () => {
    verifyOtp.mockResolvedValue({ error: new Error("invalid") });
    const request = new NextRequest(
      "http://localhost/auth/callback?token_hash=bad&type=magiclink&next=/stock",
    );

    const response = await GET(request);

    expect(verifyOtp).toHaveBeenCalledOnce();
    expect(bootstrapDefaultOrgAndWarehouse).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost/login?error=${AUTH_ERROR_CODES.AUTH_LINK_INVALID_OR_EXPIRED}&next=%2Fstock`,
    );
  });

  it("redirects to login with error when token is missing", async () => {
    const request = new NextRequest(
      "http://localhost/auth/callback?type=magiclink&next=/stock",
    );

    const response = await GET(request);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(bootstrapDefaultOrgAndWarehouse).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost/login?error=${AUTH_ERROR_CODES.AUTH_LINK_INVALID_OR_EXPIRED}&next=%2Fstock`,
    );
  });

  it("exchanges auth code on server and redirects to next path", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const request = new NextRequest(
      "http://localhost/auth/callback?code=abc123&next=/stock",
    );

    const response = await GET(request);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(bootstrapDefaultOrgAndWarehouse).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/stock");
  });

  it("redirects to login when code exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error("exchange failed"),
    });
    const request = new NextRequest(
      "http://localhost/auth/callback?code=abc123&next=/stock",
    );

    const response = await GET(request);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(bootstrapDefaultOrgAndWarehouse).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost/login?error=${AUTH_ERROR_CODES.AUTH_LINK_INVALID_OR_EXPIRED}&next=%2Fstock`,
    );
  });

  it("accepts token param as token_hash fallback", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const request = new NextRequest(
      "http://localhost/auth/callback?token=pkce-token&type=magiclink&next=/stock",
    );

    const response = await GET(request);

    expect(verifyOtp).toHaveBeenCalledOnce();
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "pkce-token",
    });
    expect(bootstrapDefaultOrgAndWarehouse).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/stock");
  });

  it("redirects to login when bootstrap fails", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    bootstrapDefaultOrgAndWarehouse.mockRejectedValueOnce(
      new Error("bootstrap failed"),
    );
    const request = new NextRequest(
      "http://localhost/auth/callback?token_hash=token&type=magiclink&next=/stock",
    );

    const response = await GET(request);

    expect(verifyOtp).toHaveBeenCalledOnce();
    expect(bootstrapDefaultOrgAndWarehouse).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost/login?error=${AUTH_ERROR_CODES.BOOTSTRAP_FAILED}&next=%2Fstock`,
    );
  });
});
