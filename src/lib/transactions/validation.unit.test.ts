import { describe, expect, it } from "vitest";

import { TRANSACTION_ERROR_CODES } from "@/lib/transactions/errors";
import {
  validateConsumeFromBatchInput,
  validateCreateInboundBatchInput,
  validateAddInboundToBatchInput,
  validateAdjustBatchQuantityInput,
  validateListStockBatchesInput,
} from "@/lib/transactions/validation";

const VALID_ITEM_ID = "00000000-0000-0000-0000-000000000001";
const VALID_BATCH_ID = "00000000-0000-0000-0000-000000000002";

describe("validateCreateInboundBatchInput", () => {
  it("accepts minimum valid input", () => {
    const result = validateCreateInboundBatchInput({
      itemId: VALID_ITEM_ID,
      quantity: 1,
    });
    expect(result.itemId).toBe(VALID_ITEM_ID);
    expect(result.quantity).toBe(1);
    expect(result.expiryDate).toBeNull();
    expect(result.storageLocationId).toBeNull();
    expect(result.tagId).toBeNull();
    expect(result.note).toBeNull();
    expect(result.idempotencyKey).toBeNull();
  });

  it("accepts quantity=1 (minimum valid)", () => {
    const result = validateCreateInboundBatchInput({
      itemId: VALID_ITEM_ID,
      quantity: 1,
    });
    expect(result.quantity).toBe(1);
  });

  it("accepts large integer quantity", () => {
    const result = validateCreateInboundBatchInput({
      itemId: VALID_ITEM_ID,
      quantity: 1000,
    });
    expect(result.quantity).toBe(1000);
  });

  it("rejects quantity=0", () => {
    expect(() =>
      validateCreateInboundBatchInput({ itemId: VALID_ITEM_ID, quantity: 0 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects negative quantity", () => {
    expect(() =>
      validateCreateInboundBatchInput({ itemId: VALID_ITEM_ID, quantity: -1 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects fractional quantity (e.g. 1.5)", () => {
    expect(() =>
      validateCreateInboundBatchInput({ itemId: VALID_ITEM_ID, quantity: 1.5 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects NaN quantity", () => {
    expect(() =>
      validateCreateInboundBatchInput({ itemId: VALID_ITEM_ID, quantity: NaN }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects Infinity quantity", () => {
    expect(() =>
      validateCreateInboundBatchInput({ itemId: VALID_ITEM_ID, quantity: Infinity }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("accepts valid ISO date for expiryDate", () => {
    const result = validateCreateInboundBatchInput({
      itemId: VALID_ITEM_ID,
      quantity: 5,
      expiryDate: "2027-12-31",
    });
    expect(result.expiryDate).toBe("2027-12-31");
  });

  it("rejects invalid date format", () => {
    expect(() =>
      validateCreateInboundBatchInput({
        itemId: VALID_ITEM_ID,
        quantity: 5,
        expiryDate: "not-a-date",
      }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects partial date like 2027-12", () => {
    expect(() =>
      validateCreateInboundBatchInput({
        itemId: VALID_ITEM_ID,
        quantity: 5,
        expiryDate: "2027-12",
      }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("converts empty expiryDate string to null", () => {
    const result = validateCreateInboundBatchInput({
      itemId: VALID_ITEM_ID,
      quantity: 5,
      expiryDate: "  ",
    });
    expect(result.expiryDate).toBeNull();
  });

  it("trims and returns null for empty optional string fields", () => {
    const result = validateCreateInboundBatchInput({
      itemId: VALID_ITEM_ID,
      quantity: 5,
      note: "  ",
      idempotencyKey: "",
      storageLocationId: " ",
      tagId: "",
    });
    expect(result.note).toBeNull();
    expect(result.idempotencyKey).toBeNull();
    expect(result.storageLocationId).toBeNull();
    expect(result.tagId).toBeNull();
  });

  it("preserves non-empty optional fields", () => {
    const result = validateCreateInboundBatchInput({
      itemId: VALID_ITEM_ID,
      quantity: 5,
      note: "Keep dry",
      idempotencyKey: "uuid-abc-123",
      storageLocationId: "loc-uuid",
      tagId: "tag-uuid",
    });
    expect(result.note).toBe("Keep dry");
    expect(result.idempotencyKey).toBe("uuid-abc-123");
    expect(result.storageLocationId).toBe("loc-uuid");
    expect(result.tagId).toBe("tag-uuid");
  });
});

describe("validateConsumeFromBatchInput", () => {
  const VALID_BATCH_ID = "00000000-0000-0000-0000-000000000002";

  it("accepts decimal quantity", () => {
    const result = validateConsumeFromBatchInput({
      batchId: VALID_BATCH_ID,
      quantity: 2.5,
    });
    expect(result.batchId).toBe(VALID_BATCH_ID);
    expect(result.quantity).toBe(2.5);
    expect(result.note).toBeNull();
    expect(result.idempotencyKey).toBeNull();
  });

  it("accepts integer quantity (decimals are a superset of integers)", () => {
    const result = validateConsumeFromBatchInput({
      batchId: VALID_BATCH_ID,
      quantity: 1,
    });
    expect(result.quantity).toBe(1);
  });

  it("accepts small decimal quantity", () => {
    const result = validateConsumeFromBatchInput({
      batchId: VALID_BATCH_ID,
      quantity: 0.001,
    });
    expect(result.quantity).toBe(0.001);
  });

  it("rejects quantity=0", () => {
    expect(() =>
      validateConsumeFromBatchInput({ batchId: VALID_BATCH_ID, quantity: 0 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects negative quantity", () => {
    expect(() =>
      validateConsumeFromBatchInput({ batchId: VALID_BATCH_ID, quantity: -1 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects NaN quantity", () => {
    expect(() =>
      validateConsumeFromBatchInput({ batchId: VALID_BATCH_ID, quantity: NaN }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects Infinity quantity", () => {
    expect(() =>
      validateConsumeFromBatchInput({ batchId: VALID_BATCH_ID, quantity: Infinity }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects empty batchId", () => {
    expect(() =>
      validateConsumeFromBatchInput({ batchId: "", quantity: 1 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.FORBIDDEN }));
  });

  it("rejects whitespace-only batchId", () => {
    expect(() =>
      validateConsumeFromBatchInput({ batchId: "   ", quantity: 1 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.FORBIDDEN }));
  });

  it("normalizes empty note to null", () => {
    const result = validateConsumeFromBatchInput({
      batchId: VALID_BATCH_ID,
      quantity: 1,
      note: "",
    });
    expect(result.note).toBeNull();
  });

  it("normalizes whitespace-only idempotencyKey to null", () => {
    const result = validateConsumeFromBatchInput({
      batchId: VALID_BATCH_ID,
      quantity: 1,
      idempotencyKey: "  ",
    });
    expect(result.idempotencyKey).toBeNull();
  });

  it("preserves non-empty optional fields", () => {
    const result = validateConsumeFromBatchInput({
      batchId: VALID_BATCH_ID,
      quantity: 1,
      note: "used in drill",
      idempotencyKey: "key-abc-123",
    });
    expect(result.note).toBe("used in drill");
    expect(result.idempotencyKey).toBe("key-abc-123");
  });
});

describe("validateAddInboundToBatchInput", () => {
  it("accepts minimum valid input", () => {
    const result = validateAddInboundToBatchInput({
      batchId: VALID_BATCH_ID,
      quantity: 5,
    });
    expect(result.batchId).toBe(VALID_BATCH_ID);
    expect(result.quantity).toBe(5);
    expect(result.note).toBeNull();
    expect(result.idempotencyKey).toBeNull();
  });

  it("rejects quantity=0", () => {
    expect(() =>
      validateAddInboundToBatchInput({ batchId: VALID_BATCH_ID, quantity: 0 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects fractional quantity", () => {
    expect(() =>
      validateAddInboundToBatchInput({ batchId: VALID_BATCH_ID, quantity: 2.7 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects negative quantity", () => {
    expect(() =>
      validateAddInboundToBatchInput({ batchId: VALID_BATCH_ID, quantity: -5 }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });
});

describe("validateAdjustBatchQuantityInput", () => {
  const VALID_BATCH_ID = "00000000-0000-0000-0000-000000000002";
  const VALID_KEY = "test-idempotency-key";

  it("accepts actualQuantity=0 (adjust to zero is valid)", () => {
    const result = validateAdjustBatchQuantityInput({
      batchId: VALID_BATCH_ID,
      actualQuantity: 0,
      idempotencyKey: VALID_KEY,
    });
    expect(result.batchId).toBe(VALID_BATCH_ID);
    expect(result.actualQuantity).toBe(0);
    expect(result.note).toBeNull();
    expect(result.idempotencyKey).toBe(VALID_KEY);
  });

  it("accepts positive integer actualQuantity", () => {
    const result = validateAdjustBatchQuantityInput({
      batchId: VALID_BATCH_ID,
      actualQuantity: 8,
      idempotencyKey: VALID_KEY,
    });
    expect(result.actualQuantity).toBe(8);
  });

  it("accepts decimal actualQuantity", () => {
    const result = validateAdjustBatchQuantityInput({
      batchId: VALID_BATCH_ID,
      actualQuantity: 4.5,
      idempotencyKey: VALID_KEY,
    });
    expect(result.actualQuantity).toBe(4.5);
  });

  it("accepts small decimal actualQuantity", () => {
    const result = validateAdjustBatchQuantityInput({
      batchId: VALID_BATCH_ID,
      actualQuantity: 0.001,
      idempotencyKey: VALID_KEY,
    });
    expect(result.actualQuantity).toBe(0.001);
  });

  it("rejects negative actualQuantity", () => {
    expect(() =>
      validateAdjustBatchQuantityInput({ batchId: VALID_BATCH_ID, actualQuantity: -1, idempotencyKey: VALID_KEY }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects NaN actualQuantity", () => {
    expect(() =>
      validateAdjustBatchQuantityInput({ batchId: VALID_BATCH_ID, actualQuantity: NaN, idempotencyKey: VALID_KEY }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects Infinity actualQuantity", () => {
    expect(() =>
      validateAdjustBatchQuantityInput({ batchId: VALID_BATCH_ID, actualQuantity: Infinity, idempotencyKey: VALID_KEY }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.QUANTITY_INVALID }));
  });

  it("rejects empty batchId", () => {
    expect(() =>
      validateAdjustBatchQuantityInput({ batchId: "", actualQuantity: 5, idempotencyKey: VALID_KEY }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.FORBIDDEN }));
  });

  it("rejects whitespace-only batchId", () => {
    expect(() =>
      validateAdjustBatchQuantityInput({ batchId: "   ", actualQuantity: 5, idempotencyKey: VALID_KEY }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.FORBIDDEN }));
  });

  it("normalizes empty note to null", () => {
    const result = validateAdjustBatchQuantityInput({
      batchId: VALID_BATCH_ID,
      actualQuantity: 5,
      note: "",
      idempotencyKey: VALID_KEY,
    });
    expect(result.note).toBeNull();
  });

  it("rejects empty string idempotencyKey", () => {
    expect(() =>
      validateAdjustBatchQuantityInput({ batchId: VALID_BATCH_ID, actualQuantity: 5, idempotencyKey: "" }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED }));
  });

  it("rejects whitespace-only idempotencyKey", () => {
    expect(() =>
      validateAdjustBatchQuantityInput({ batchId: VALID_BATCH_ID, actualQuantity: 5, idempotencyKey: "  " }),
    ).toThrow(expect.objectContaining({ code: TRANSACTION_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED }));
  });

  it("preserves non-empty optional fields", () => {
    const result = validateAdjustBatchQuantityInput({
      batchId: VALID_BATCH_ID,
      actualQuantity: 8,
      note: "inventory recount",
      idempotencyKey: "key-abc-123",
    });
    expect(result.note).toBe("inventory recount");
    expect(result.idempotencyKey).toBe("key-abc-123");
  });

  // delta calculation: ensure 0 is distinct from positive (both valid for adjustment)
  it("distinguishes actualQuantity=0 from positive (both valid but semantically different)", () => {
    const resultZero = validateAdjustBatchQuantityInput({
      batchId: VALID_BATCH_ID,
      actualQuantity: 0,
      idempotencyKey: VALID_KEY,
    });
    const resultPositive = validateAdjustBatchQuantityInput({
      batchId: VALID_BATCH_ID,
      actualQuantity: 10,
      idempotencyKey: VALID_KEY,
    });
    expect(resultZero.actualQuantity).toBe(0);
    expect(resultPositive.actualQuantity).toBe(10);
  });
});

describe("validateListStockBatchesInput", () => {
  it("accepts empty input, returns defaults", () => {
    const result = validateListStockBatchesInput({});
    expect(result.q).toBeNull();
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeNull();
  });

  it("accepts q=undefined", () => {
    const result = validateListStockBatchesInput({ q: undefined });
    expect(result.q).toBeNull();
  });

  it("trims and returns null for q=empty string", () => {
    const result = validateListStockBatchesInput({ q: "" });
    expect(result.q).toBeNull();
  });

  it("trims and returns null for q=whitespace only", () => {
    const result = validateListStockBatchesInput({ q: "   " });
    expect(result.q).toBeNull();
  });

  it("accepts q with valid length (200 chars)", () => {
    const q = "a".repeat(200);
    const result = validateListStockBatchesInput({ q });
    expect(result.q).toBe(q);
  });

  it("rejects q longer than 200 chars after trim", () => {
    const q = "a".repeat(201);
    expect(() => validateListStockBatchesInput({ q })).toThrow(
      expect.objectContaining({ code: TRANSACTION_ERROR_CODES.INVALID_QUERY }),
    );
  });

  it("trims q before validating length", () => {
    const q = " " + "a".repeat(200) + " ";
    // trimmed = 200 chars → valid
    const result = validateListStockBatchesInput({ q });
    expect(result.q).toBe("a".repeat(200));
  });

  it("limit=undefined defaults to 50", () => {
    const result = validateListStockBatchesInput({});
    expect(result.limit).toBe(50);
  });

  it("limit=500 is clamped to 200", () => {
    const result = validateListStockBatchesInput({ limit: 500 });
    expect(result.limit).toBe(200);
  });

  it("limit=0 is clamped to 1", () => {
    const result = validateListStockBatchesInput({ limit: 0 });
    expect(result.limit).toBe(1);
  });

  it("limit=-1 is clamped to 1", () => {
    const result = validateListStockBatchesInput({ limit: -1 });
    expect(result.limit).toBe(1);
  });

  it("limit=50 is accepted as-is", () => {
    const result = validateListStockBatchesInput({ limit: 50 });
    expect(result.limit).toBe(50);
  });

  it("limit=200 is accepted as-is (max)", () => {
    const result = validateListStockBatchesInput({ limit: 200 });
    expect(result.limit).toBe(200);
  });

  it("limit=1 is accepted as-is (min)", () => {
    const result = validateListStockBatchesInput({ limit: 1 });
    expect(result.limit).toBe(1);
  });

  it("cursor is passed through when provided", () => {
    const result = validateListStockBatchesInput({ cursor: "some-cursor-value" });
    expect(result.cursor).toBe("some-cursor-value");
  });

  it("cursor=null returns null", () => {
    const result = validateListStockBatchesInput({ cursor: null });
    expect(result.cursor).toBeNull();
  });
});
