import { describe, expect, it } from "vitest";

import { LocationError, LOCATION_ERROR_CODES } from "@/lib/storage-locations/errors";
import {
  validateCreateLocationInput,
  validateRenameLocationInput,
} from "@/lib/storage-locations/validation";

describe("storage locations validation", () => {
  it("rejects empty name on create", () => {
    expect(() => validateCreateLocationInput({ name: "" })).toThrowError(
      new LocationError(LOCATION_ERROR_CODES.LOCATION_NAME_REQUIRED),
    );
  });

  it("rejects whitespace-only name on create", () => {
    expect(() => validateCreateLocationInput({ name: "   " })).toThrowError(
      new LocationError(LOCATION_ERROR_CODES.LOCATION_NAME_REQUIRED),
    );
  });

  it("trims create name", () => {
    expect(validateCreateLocationInput({ name: " 廚房 " })).toEqual({ name: "廚房" });
  });

  it("rejects empty name on rename", () => {
    expect(() => validateRenameLocationInput({ name: "" })).toThrowError(
      new LocationError(LOCATION_ERROR_CODES.LOCATION_NAME_REQUIRED),
    );
  });

  it("rejects whitespace-only name on rename", () => {
    expect(() => validateRenameLocationInput({ name: "   " })).toThrowError(
      new LocationError(LOCATION_ERROR_CODES.LOCATION_NAME_REQUIRED),
    );
  });

  it("trims rename name", () => {
    expect(validateRenameLocationInput({ name: " 客廳 " })).toEqual({ name: "客廳" });
  });

  it("accepts valid rename input", () => {
    expect(validateRenameLocationInput({ name: "客廳" })).toEqual({ name: "客廳" });
  });
});
