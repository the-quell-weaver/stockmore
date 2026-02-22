export const LOCATION_ERROR_CODES = {
  LOCATION_NAME_REQUIRED: "LOCATION_NAME_REQUIRED",
  LOCATION_NAME_CONFLICT: "LOCATION_NAME_CONFLICT",
  LOCATION_NOT_FOUND: "LOCATION_NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
} as const;

export type LocationErrorCode =
  (typeof LOCATION_ERROR_CODES)[keyof typeof LOCATION_ERROR_CODES];

export class LocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode, message?: string) {
    super(message ?? code);
    this.name = "LocationError";
    this.code = code;
  }
}
