import { describe, expect, it } from "vitest";

import { TagError, TAG_ERROR_CODES } from "@/lib/tags/errors";
import { validateCreateTagInput, validateRenameTagInput } from "@/lib/tags/validation";

describe("tags validation", () => {
  it("rejects empty name on create", () => {
    expect(() => validateCreateTagInput({ name: "" })).toThrowError(
      new TagError(TAG_ERROR_CODES.TAG_NAME_REQUIRED),
    );
  });

  it("rejects whitespace-only name on create", () => {
    expect(() => validateCreateTagInput({ name: "   " })).toThrowError(
      new TagError(TAG_ERROR_CODES.TAG_NAME_REQUIRED),
    );
  });

  it("trims create name", () => {
    expect(validateCreateTagInput({ name: " 飲水 " })).toEqual({ name: "飲水" });
  });

  it("rejects empty name on rename", () => {
    expect(() => validateRenameTagInput({ name: "" })).toThrowError(
      new TagError(TAG_ERROR_CODES.TAG_NAME_REQUIRED),
    );
  });

  it("rejects whitespace-only name on rename", () => {
    expect(() => validateRenameTagInput({ name: "   " })).toThrowError(
      new TagError(TAG_ERROR_CODES.TAG_NAME_REQUIRED),
    );
  });

  it("trims rename name", () => {
    expect(validateRenameTagInput({ name: " 乾糧 " })).toEqual({ name: "乾糧" });
  });

  it("accepts valid rename input", () => {
    expect(validateRenameTagInput({ name: "醫療" })).toEqual({ name: "醫療" });
  });
});
