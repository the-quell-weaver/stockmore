export const ITEM_ERROR_CODES = {
  ITEM_NAME_REQUIRED: "ITEM_NAME_REQUIRED",
  ITEM_UNIT_REQUIRED: "ITEM_UNIT_REQUIRED",
  ITEM_MIN_STOCK_INVALID: "ITEM_MIN_STOCK_INVALID",
  ITEM_NAME_CONFLICT: "ITEM_NAME_CONFLICT",
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
} as const;

export type ItemErrorCode =
  (typeof ITEM_ERROR_CODES)[keyof typeof ITEM_ERROR_CODES];

export class ItemError extends Error {
  readonly code: ItemErrorCode;

  constructor(code: ItemErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ItemError";
    this.code = code;
  }
}
