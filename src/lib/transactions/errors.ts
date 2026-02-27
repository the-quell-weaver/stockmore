export const TRANSACTION_ERROR_CODES = {
  QUANTITY_INVALID: "QUANTITY_INVALID",
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
  BATCH_NOT_FOUND: "BATCH_NOT_FOUND",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  INVALID_QUERY: "INVALID_QUERY",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
} as const;

export type TransactionErrorCode =
  (typeof TRANSACTION_ERROR_CODES)[keyof typeof TRANSACTION_ERROR_CODES];

export class TransactionError extends Error {
  readonly code: TransactionErrorCode;

  constructor(code: TransactionErrorCode, message?: string) {
    super(message ?? code);
    this.name = "TransactionError";
    this.code = code;
  }
}
