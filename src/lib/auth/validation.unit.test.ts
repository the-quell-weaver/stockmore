import { describe, expect, it } from "vitest";

import { isValidEmail, sanitizeNextPath } from "./validation";

const DEFAULT_NEXT = "/stock";

describe("isValidEmail", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail(" user+tag@stockmore.io ")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("userexample.com")).toBe(false);
    expect(isValidEmail("user@com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
  });
});

describe("sanitizeNextPath", () => {
  it("falls back for empty or unsafe values", () => {
    expect(sanitizeNextPath(undefined, DEFAULT_NEXT)).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath("", DEFAULT_NEXT)).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath("https://evil.com", DEFAULT_NEXT)).toBe(
      DEFAULT_NEXT,
    );
    expect(sanitizeNextPath("//evil.com", DEFAULT_NEXT)).toBe(DEFAULT_NEXT);
    expect(sanitizeNextPath("stock", DEFAULT_NEXT)).toBe(DEFAULT_NEXT);
  });

  it("allows relative paths", () => {
    expect(sanitizeNextPath("/stock", DEFAULT_NEXT)).toBe("/stock");
    expect(sanitizeNextPath("/stock?view=1", DEFAULT_NEXT)).toBe(
      "/stock?view=1",
    );
  });
});
