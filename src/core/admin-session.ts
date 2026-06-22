export const ADMIN_SESSION_TIMEOUT_MS = 10 * 60_000;

export const isAuthorizationValid = (
  authorizedAtMs: number,
  nowMs: number,
  timeoutMs: number
): boolean => nowMs <= authorizedAtMs + timeoutMs;
