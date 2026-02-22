export const TAG_ERROR_CODES = {
  TAG_NAME_REQUIRED: "TAG_NAME_REQUIRED",
  TAG_NAME_CONFLICT: "TAG_NAME_CONFLICT",
  TAG_NOT_FOUND: "TAG_NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
} as const;

export type TagErrorCode = (typeof TAG_ERROR_CODES)[keyof typeof TAG_ERROR_CODES];

export class TagError extends Error {
  readonly code: TagErrorCode;

  constructor(code: TagErrorCode, message?: string) {
    super(message ?? code);
    this.name = "TagError";
    this.code = code;
  }
}
