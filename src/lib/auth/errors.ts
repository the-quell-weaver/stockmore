export const AUTH_ERROR_CODES = {
  AUTH_EMAIL_INVALID: "AUTH_EMAIL_INVALID",
  AUTH_LINK_INVALID_OR_EXPIRED: "AUTH_LINK_INVALID_OR_EXPIRED",
  BOOTSTRAP_FAILED: "BOOTSTRAP_FAILED",
  AUTH_REQUIRED: "AUTH_REQUIRED",
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  [AUTH_ERROR_CODES.AUTH_EMAIL_INVALID]:
    "Please enter a valid email address.",
  [AUTH_ERROR_CODES.AUTH_LINK_INVALID_OR_EXPIRED]:
    "The login link is invalid or expired. Enter your email to resend a new link.",
  [AUTH_ERROR_CODES.BOOTSTRAP_FAILED]:
    "We couldn't finish setting up your account. Please try again.",
  [AUTH_ERROR_CODES.AUTH_REQUIRED]: "Please sign in to continue.",
};

export function parseAuthErrorCode(
  raw?: string | null,
): AuthErrorCode | null {
  if (!raw) return null;
  const candidate = raw.trim();
  const codes = Object.values(AUTH_ERROR_CODES) as string[];
  return (codes.includes(candidate) ? candidate : null) as AuthErrorCode | null;
}

export function getAuthErrorMessage(code: AuthErrorCode): string {
  return AUTH_ERROR_MESSAGES[code];
}
