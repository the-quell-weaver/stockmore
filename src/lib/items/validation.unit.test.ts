import { describe, expect, it } from "vitest";

import { ItemError, ITEM_ERROR_CODES } from "@/lib/items/errors";
import {
  normalizeListQuery,
  validateCreateItemInput,
  validateTargetQuantity,
  validateUpdateItemInput,
} from "@/lib/items/validation";

describe("items validation", () => {
  it("trims and normalizes create input", () => {
    const result = validateCreateItemInput({
      name: "  Rice  ",
      unit: "  kg ",
      minStock: 1.5,
      note: "  dry storage ",
      defaultTagIds: ["  "],
    });

    expect(result).toEqual({
      name: "Rice",
      unit: "kg",
      minStock: 1.5,
      note: "dry storage",
      defaultTagIds: null,
    });
  });

  it("rejects empty name", () => {
    expect(() =>
      validateCreateItemInput({ name: "   ", unit: "box", minStock: 0 }),
    ).toThrowError(new ItemError(ITEM_ERROR_CODES.ITEM_NAME_REQUIRED));
  });

  it("rejects empty unit", () => {
    expect(() =>
      validateCreateItemInput({ name: "Water", unit: "   ", minStock: 0 }),
    ).toThrowError(new ItemError(ITEM_ERROR_CODES.ITEM_UNIT_REQUIRED));
  });

  it("rejects negative min stock", () => {
    expect(() =>
      validateCreateItemInput({ name: "Water", unit: "L", minStock: -1 }),
    ).toThrowError(new ItemError(ITEM_ERROR_CODES.ITEM_MIN_STOCK_INVALID));
  });

  it("validates partial update patches", () => {
    const patch = validateUpdateItemInput({
      note: "  ",
      isDeleted: true,
      defaultTagIds: null,
    });

    expect(patch).toEqual({
      note: null,
      isDeleted: true,
      defaultTagIds: null,
    });
  });

  it("normalizes list query", () => {
    expect(normalizeListQuery({ q: "  rice  " })).toEqual({
      q: "rice",
      includeDeleted: false,
    });
    expect(normalizeListQuery()).toEqual({ q: undefined, includeDeleted: false });
  });
});

describe("validateTargetQuantity", () => {
  it("accepts null (remove from plan)", () => {
    expect(validateTargetQuantity(null)).toBeNull();
  });

  it("accepts positive integer", () => {
    expect(validateTargetQuantity(10)).toBe(10);
  });

  it("accepts positive decimal", () => {
    expect(validateTargetQuantity(2.5)).toBe(2.5);
  });

  it("rejects zero", () => {
    expect(() => validateTargetQuantity(0)).toThrow("TARGET_QUANTITY_INVALID");
  });

  it("rejects negative", () => {
    expect(() => validateTargetQuantity(-1)).toThrow("TARGET_QUANTITY_INVALID");
  });

  it("rejects NaN", () => {
    expect(() => validateTargetQuantity(NaN)).toThrow("TARGET_QUANTITY_INVALID");
  });
});
