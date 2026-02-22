import { TransactionError, TRANSACTION_ERROR_CODES } from "@/lib/transactions/errors";

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
