import { describe, expect, it } from "vitest";

import {
  checkLockout,
  createLockoutState,
  hashCode,
  LOCKOUT_FAILURE_THRESHOLD,
  recordAuthFailure,
  recordAuthSuccess,
  verifyCode
} from "./auth";

describe("auth code hashing", () => {
  it("verifies the correct code and rejects the wrong code", () => {
    // Given
    const authCode = "correct-auth-code";
    const wrongCode = "wrong-auth-code";
    const record = hashCode(authCode);

    // When
    const correctResult = verifyCode(authCode, record.salt, record.hash);
    const wrongResult = verifyCode(wrongCode, record.salt, record.hash);

    // Then
    expect(correctResult).toBe(true);
    expect(wrongResult).toBe(false);
  });
});

describe("brute-force lockout", () => {
  it("allows attempts before the threshold and blocks at the threshold", () => {
    // Given
    const userId = "staff01";
    const now = 1_000;
    let state = createLockoutState();

    // When
    for (let attempt = 1; attempt < LOCKOUT_FAILURE_THRESHOLD; attempt += 1) {
      const result = recordAuthFailure(state, userId, now + attempt);
      state = result.state;
    }
    const beforeThreshold = checkLockout(state, userId, now + 10);
    const thresholdResult = recordAuthFailure(state, userId, now + 20);

    // Then
    expect(beforeThreshold.allowed).toBe(true);
    expect(thresholdResult.decision.allowed).toBe(false);
    expect(thresholdResult.decision.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows attempts again after the lockout window expires", () => {
    // Given
    const userId = "staff01";
    const now = 2_000;
    let state = createLockoutState();

    for (let attempt = 1; attempt <= LOCKOUT_FAILURE_THRESHOLD; attempt += 1) {
      const result = recordAuthFailure(state, userId, now);
      state = result.state;
    }

    const blocked = checkLockout(state, userId, now);
    const retryAfterMs = blocked.retryAfterMs ?? 0;

    // When
    const afterWindow = checkLockout(state, userId, now + retryAfterMs + 1);

    // Then
    expect(blocked.allowed).toBe(false);
    expect(retryAfterMs).toBeGreaterThan(0);
    expect(afterWindow.allowed).toBe(true);
  });

  it("clears the lockout after a successful authentication", () => {
    // Given
    const userId = "staff01";
    const now = 3_000;
    let state = createLockoutState();

    for (let attempt = 1; attempt <= LOCKOUT_FAILURE_THRESHOLD; attempt += 1) {
      const result = recordAuthFailure(state, userId, now);
      state = result.state;
    }

    const blocked = checkLockout(state, userId, now);

    // When
    state = recordAuthSuccess(state, userId);
    const afterSuccess = checkLockout(state, userId, now);

    // Then
    expect(blocked.allowed).toBe(false);
    expect(afterSuccess.allowed).toBe(true);
    expect(state.entries[userId]).toBeUndefined();
  });
});
