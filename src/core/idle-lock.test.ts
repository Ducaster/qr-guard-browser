import { describe, expect, it } from "vitest";

import { shouldRelockForIdle } from "./idle-lock";

describe("idle auto-lock decision", () => {
  it("relocks only when an unlocked session reaches the configured idle threshold", () => {
    // Given / When / Then
    expect(
      shouldRelockForIdle({
        idleAutoLockSeconds: 30,
        state: "unlocked",
        systemIdleSeconds: 30
      })
    ).toBe(true);
    expect(
      shouldRelockForIdle({
        idleAutoLockSeconds: 30,
        state: "unlocked",
        systemIdleSeconds: 29
      })
    ).toBe(false);
    expect(
      shouldRelockForIdle({
        idleAutoLockSeconds: 30,
        state: "siteLogin",
        systemIdleSeconds: 30
      })
    ).toBe(true);
    expect(
      shouldRelockForIdle({
        idleAutoLockSeconds: 30,
        state: "loginMode",
        systemIdleSeconds: 30
      })
    ).toBe(false);
  });
});
