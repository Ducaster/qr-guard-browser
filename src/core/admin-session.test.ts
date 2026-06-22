import { describe, expect, it } from "vitest";

import { ADMIN_SESSION_TIMEOUT_MS, isAuthorizationValid } from "./admin-session";

describe("admin session authorization", () => {
  it("is valid within the timeout window", () => {
    // Given
    const authorizedAtMs = 10_000;
    const nowMs = authorizedAtMs + ADMIN_SESSION_TIMEOUT_MS;

    // When
    const result = isAuthorizationValid(authorizedAtMs, nowMs, ADMIN_SESSION_TIMEOUT_MS);

    // Then
    expect(result).toBe(true);
  });

  it("is invalid once now exceeds the timeout window", () => {
    // Given
    const authorizedAtMs = 10_000;
    const nowMs = authorizedAtMs + ADMIN_SESSION_TIMEOUT_MS + 1;

    // When
    const result = isAuthorizationValid(authorizedAtMs, nowMs, ADMIN_SESSION_TIMEOUT_MS);

    // Then
    expect(result).toBe(false);
  });
});
