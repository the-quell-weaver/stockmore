import { TransactionError, TRANSACTION_ERROR_CODES } from "@/lib/transactions/errors";

export type ConsumeFromBatchInput = {
  batchId: string;
  quantity: number;
  note?: string | null;
  idempotencyKey?: string | null;
};

export type CreateInboundBatchInput = {
  itemId: string;
  quantity: number;
  expiryDate?: string | null;
  storageLocationId?: string | null;
  tagId?: string | null;
  note?: string | null;
  idempotencyKey?: string | null;
};

export type AddInboundToBatchInput = {
  batchId: string;
  quantity: number;
  note?: string | null;
  idempotencyKey?: string | null;
};

export type AdjustBatchQuantityInput = {
  batchId: string;
  actualQuantity: number;
  note?: string | null;
  idempotencyKey?: string | null;
};

export function validateConsumeFromBatchInput(
  input: ConsumeFromBatchInput,
): ConsumeFromBatchInput {
  return {
    batchId: validateId(input.batchId),
    quantity: validateDecimalQuantity(input.quantity),
    note: normalizeOptionalText(input.note),
    idempotencyKey: normalizeOptionalText(input.idempotencyKey),
  };
}

export function validateCreateInboundBatchInput(
  input: CreateInboundBatchInput,
): CreateInboundBatchInput {
  return {
    itemId: validateId(input.itemId),
    quantity: validateQuantity(input.quantity),
    expiryDate: normalizeOptionalDate(input.expiryDate),
    storageLocationId: normalizeOptionalId(input.storageLocationId),
    tagId: normalizeOptionalId(input.tagId),
    note: normalizeOptionalText(input.note),
    idempotencyKey: normalizeOptionalText(input.idempotencyKey),
  };
}

export function validateAddInboundToBatchInput(
  input: AddInboundToBatchInput,
): AddInboundToBatchInput {
  return {
    batchId: validateId(input.batchId),
    quantity: validateQuantity(input.quantity),
    note: normalizeOptionalText(input.note),
    idempotencyKey: normalizeOptionalText(input.idempotencyKey),
  };
}

export function validateAdjustBatchQuantityInput(
  input: AdjustBatchQuantityInput,
): AdjustBatchQuantityInput {
  return {
    batchId: validateId(input.batchId),
    actualQuantity: validateNonNegativeDecimal(input.actualQuantity),
    note: normalizeOptionalText(input.note),
    idempotencyKey: normalizeOptionalText(input.idempotencyKey),
  };
}

function validateId(raw: string): string {
  const value = raw?.trim() ?? "";
  if (!value) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.FORBIDDEN);
  }
  return value;
}

function validateQuantity(raw: number): number {
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.QUANTITY_INVALID);
  }
  return raw;
}

function validateDecimalQuantity(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.QUANTITY_INVALID);
  }
  return raw;
}

// Allows 0 (adjustment to zero is valid); rejects negative and non-finite values.
function validateNonNegativeDecimal(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.QUANTITY_INVALID);
  }
  return raw;
}

function normalizeOptionalDate(raw?: string | null): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!value) return null;
  // Must be a valid ISO date (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.QUANTITY_INVALID);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TransactionError(TRANSACTION_ERROR_CODES.QUANTITY_INVALID);
  }
  return value;
}

function normalizeOptionalId(raw?: string | null): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

function normalizeOptionalText(raw?: string | null): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}
