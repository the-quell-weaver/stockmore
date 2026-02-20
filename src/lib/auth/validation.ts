const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(input: string): boolean {
  const normalized = input.trim();
  if (!normalized) return false;
  return EMAIL_REGEX.test(normalized);
}

export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback = "/stock",
): string {
  if (!raw) return fallback;
  const normalized = raw.trim();
  if (!normalized) return fallback;
  if (!normalized.startsWith("/")) return fallback;
  if (normalized.startsWith("//")) return fallback;
  if (normalized.includes("://")) return fallback;
  return normalized;
}
