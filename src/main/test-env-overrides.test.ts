import { describe, expect, it } from "vitest";

import { hasEnabledTestFlag, readPositiveIntegerTestEnv } from "./test-env-overrides";

describe("test environment overrides", () => {
  it("reads positive integer overrides and enabled flags in unpackaged builds", () => {
    // Given
    const environment = {
      isPackaged: false,
      variables: {
        QR_GUARD_ALLOW_INSECURE_TEST_STORAGE: "1",
        QR_GUARD_TEST_UNLOCK_DURATION_SECONDS: "7"
      }
    } as const;

    // When
    const duration = readPositiveIntegerTestEnv(
      environment,
      "QR_GUARD_TEST_UNLOCK_DURATION_SECONDS"
    );
    const enabled = hasEnabledTestFlag(environment, "QR_GUARD_ALLOW_INSECURE_TEST_STORAGE");

    // Then
    expect(duration).toBe(7);
    expect(enabled).toBe(true);
  });

  it("ignores test overrides and flags in packaged builds", () => {
    // Given
    const environment = {
      isPackaged: true,
      variables: {
        QR_GUARD_ALLOW_INSECURE_TEST_STORAGE: "1",
        QR_GUARD_TEST_IDLE_POLL_MS: "1",
        QR_GUARD_TEST_SYSTEM_IDLE_SECONDS: "1",
        QR_GUARD_TEST_UNLOCK_DURATION_SECONDS: "1"
      }
    } as const;

    // When
    const unlockDuration = readPositiveIntegerTestEnv(
      environment,
      "QR_GUARD_TEST_UNLOCK_DURATION_SECONDS"
    );
    const idlePoll = readPositiveIntegerTestEnv(environment, "QR_GUARD_TEST_IDLE_POLL_MS");
    const systemIdle = readPositiveIntegerTestEnv(
      environment,
      "QR_GUARD_TEST_SYSTEM_IDLE_SECONDS"
    );
    const insecureStorage = hasEnabledTestFlag(
      environment,
      "QR_GUARD_ALLOW_INSECURE_TEST_STORAGE"
    );

    // Then
    expect(unlockDuration).toBeUndefined();
    expect(idlePoll).toBeUndefined();
    expect(systemIdle).toBeUndefined();
    expect(insecureStorage).toBe(false);
  });

  it("ignores unset, zero, and non-integer overrides", () => {
    // Given
    const environment = {
      isPackaged: false,
      variables: {
        INVALID: "not-a-number",
        ZERO: "0"
      }
    } as const;

    // When
    const missing = readPositiveIntegerTestEnv(environment, "MISSING");
    const invalid = readPositiveIntegerTestEnv(environment, "INVALID");
    const zero = readPositiveIntegerTestEnv(environment, "ZERO");

    // Then
    expect(missing).toBeUndefined();
    expect(invalid).toBeUndefined();
    expect(zero).toBeUndefined();
  });
});
