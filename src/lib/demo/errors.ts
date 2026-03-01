export const DEMO_ERROR_CODES = {
  SIGN_IN_FAILED: "SIGN_IN_FAILED",
  BOOTSTRAP_FAILED: "BOOTSTRAP_FAILED",
  SEED_FAILED: "SEED_FAILED",
} as const;

export type DemoErrorCode = (typeof DEMO_ERROR_CODES)[keyof typeof DEMO_ERROR_CODES];
